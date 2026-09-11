/**
 * The step interpreter. It walks a workflow's step tree in order, evaluating
 * FILTER and BRANCH conditions, running ACTION executors, and suspending on a
 * DELAY. Every touched step is written to the run log so the Protokoll screen
 * mirrors execution 1:1.
 *
 * Durable delays: reaching a DELAY step records where and when to resume
 * (WorkflowRun.status = WAITING, resumeAt, resumeStepId) and returns — the run's
 * transaction closes rather than holding a connection open for days. The ticker
 * later calls `resumeRun`, which re-walks the tree in "seeking" mode (no side
 * effects) until it reaches that step, then continues normally. Most flows are
 * linear (wait → act) and resume exactly; a branch is re-evaluated against the
 * freshly loaded record to navigate back to the paused step.
 */
import { withOrg, type Prisma } from "@kundeo/db";
import { buildTree, type FlowStep, type FlatStep, type FilterClause } from "@/components/automations/catalogue";
import { loadRecord, evaluateClause, evaluateAll, type LoadedRecord, type RecordType } from "./records";
import { executeAction } from "./actions-exec";

type Tx = Prisma.TransactionClient;
type Signal = "continue" | "stop" | "suspend" | "error";

interface WalkState {
  tx: Tx;
  organizationId: string;
  runId: string;
  loaded: LoadedRecord | null;
  seeking: boolean;
  resumeStepId: string | null;
  order: number;
  suspend: { stepId: string; resumeAt: Date } | null;
}

const UNIT_MS: Record<string, number> = {
  Minuten: 60_000,
  Stunden: 3_600_000,
  Tage: 86_400_000,
  Wochen: 604_800_000,
  Monate: 2_592_000_000, // 30 days, good enough for a v1 "Monate" delay
};

function computeResumeAt(config: Record<string, unknown>): Date {
  const amount = Number(config.amount);
  const unit = typeof config.unit === "string" ? config.unit : "Tage";
  const ms = (Number.isFinite(amount) ? amount : 1) * (UNIT_MS[unit] ?? UNIT_MS.Tage!);
  return new Date(Date.now() + ms);
}

function branchCondition(step: FlowStep): FilterClause | null {
  const c = step.config.condition as FilterClause | undefined;
  return c && c.field ? c : null;
}

function filterClause(step: FlowStep): FilterClause | null {
  const c = step.config as unknown as FilterClause;
  return c && c.field ? c : null;
}

async function logStep(
  state: WalkState,
  step: FlowStep,
  status: "OK" | "ERROR" | "SKIPPED",
  message: string,
  errorCode?: string,
) {
  await state.tx.workflowRunStep.create({
    data: {
      runId: state.runId,
      stepId: step.id,
      order: state.order++,
      status,
      message,
      errorCode: errorCode ?? null,
    },
  });
}

async function walkLane(state: WalkState, steps: FlowStep[]): Promise<Signal> {
  for (const step of steps) {
    // ── Seeking mode: navigate back to the paused DELAY without side effects ──
    if (state.seeking) {
      if (step.id === state.resumeStepId) {
        state.seeking = false;
        await logStep(state, step, "OK", "Wartezeit abgeschlossen");
        continue;
      }
      if (step.kind === "BRANCH") {
        const cond = branchCondition(step);
        const yes = cond && state.loaded ? evaluateClause(cond, state.loaded) : false;
        const sig = await walkLane(state, (yes ? step.yes : step.no) ?? []);
        if (!state.seeking && sig !== "continue") return sig; // resumed inside the branch and hit a terminal
      }
      continue;
    }

    // ── Normal execution ──
    switch (step.kind) {
      case "TRIGGER":
        continue; // the trigger already matched; it is not a run-log step
      case "FILTER": {
        const clause = filterClause(step);
        const pass = clause && state.loaded ? evaluateAll([clause], state.loaded) : false;
        await logStep(state, step, pass ? "OK" : "SKIPPED", pass ? "Bedingung erfüllt" : "Bedingung nicht erfüllt");
        if (!pass) return "stop";
        break;
      }
      case "BRANCH": {
        const cond = branchCondition(step);
        const yes = cond && state.loaded ? evaluateClause(cond, state.loaded) : false;
        await logStep(state, step, "OK", yes ? "Bedingung trifft zu → Ja" : "Bedingung trifft nicht zu → Nein");
        const sig = await walkLane(state, (yes ? step.yes : step.no) ?? []);
        if (sig !== "continue") return sig;
        break;
      }
      case "DELAY": {
        state.suspend = { stepId: step.id, resumeAt: computeResumeAt(step.config) };
        return "suspend";
      }
      case "ACTION": {
        if (!state.loaded) {
          await logStep(state, step, "SKIPPED", "Kein Datensatz für diese Aktion");
          break;
        }
        const outcome = await executeAction(step.type, {
          tx: state.tx,
          organizationId: state.organizationId,
          loaded: state.loaded,
          config: step.config,
        });
        await logStep(state, step, outcome.status, outcome.message, outcome.errorCode);
        if (outcome.status === "ERROR") return "error";
        break;
      }
    }
  }
  return "continue";
}

function toFlat(row: {
  id: string;
  kind: FlatStep["kind"];
  type: string;
  order: number;
  parentStepId: string | null;
  branchPath: "YES" | "NO" | null;
  config: unknown;
}): FlatStep {
  return {
    id: row.id,
    kind: row.kind,
    type: row.type,
    order: row.order,
    parentStepId: row.parentStepId,
    branchPath: row.branchPath,
    config: row.config,
  };
}

const FINAL_STATUS: Record<Exclude<Signal, "continue">, "SKIPPED" | "WAITING" | "ERROR"> = {
  stop: "SKIPPED",
  suspend: "WAITING",
  error: "ERROR",
};

async function finalize(state: WalkState, startedAt: number, signal: Signal) {
  if (signal === "suspend" && state.suspend) {
    await state.tx.workflowRun.update({
      where: { id: state.runId },
      data: { status: "WAITING", resumeAt: state.suspend.resumeAt, resumeStepId: state.suspend.stepId },
    });
    return;
  }
  const status = signal === "continue" ? "OK" : FINAL_STATUS[signal];
  await state.tx.workflowRun.update({
    where: { id: state.runId },
    data: { status, finishedAt: new Date(), durationMs: Date.now() - startedAt, resumeAt: null, resumeStepId: null },
  });
}

export interface StartRunParams {
  organizationId: string;
  workflowId: string;
  recordType: RecordType | null;
  recordId: string | null;
  triggeredByUserId?: string | null;
}

/** Create and drive a fresh run for a matched trigger. */
export async function startRun(params: StartRunParams): Promise<void> {
  const startedAt = Date.now();
  await withOrg(params.organizationId, async (tx) => {
    const rows = await tx.workflowStep.findMany({ where: { workflowId: params.workflowId }, orderBy: { order: "asc" } });
    if (!rows.length) return;
    const tree = buildTree(rows.map(toFlat));
    const loaded =
      params.recordType && params.recordId ? await loadRecord(tx, params.recordType, params.recordId) : null;
    if (params.recordType && !loaded) return; // record vanished before the run started

    const run = await tx.workflowRun.create({
      data: {
        organizationId: params.organizationId,
        workflowId: params.workflowId,
        status: "RUNNING",
        recordType: params.recordType,
        recordId: params.recordId,
        triggeredByUserId: params.triggeredByUserId ?? null,
      },
    });
    const state: WalkState = {
      tx,
      organizationId: params.organizationId,
      runId: run.id,
      loaded,
      seeking: false,
      resumeStepId: null,
      order: 0,
      suspend: null,
    };
    const signal = await walkLane(state, tree);
    await finalize(state, startedAt, signal);
  });
}

/** Continue a suspended run whose delay has elapsed. */
export async function resumeRun(organizationId: string, runId: string): Promise<void> {
  const startedAt = Date.now();
  await withOrg(organizationId, async (tx) => {
    // Atomically claim the run: only one worker can move it WAITING → RUNNING.
    const claimed = await tx.workflowRun.updateMany({ where: { id: runId, status: "WAITING" }, data: { status: "RUNNING" } });
    if (claimed.count !== 1) return; // already claimed by another tick
    const run = await tx.workflowRun.findFirst({ where: { id: runId } });
    if (!run) return;

    const rows = await tx.workflowStep.findMany({ where: { workflowId: run.workflowId }, orderBy: { order: "asc" } });
    const tree = buildTree(rows.map(toFlat));
    const loaded =
      run.recordType && run.recordId ? await loadRecord(tx, run.recordType as RecordType, run.recordId) : null;
    const existing = await tx.workflowRunStep.count({ where: { runId } });

    if (run.recordType && !loaded) {
      await tx.workflowRun.update({
        where: { id: runId },
        data: { status: "SKIPPED", finishedAt: new Date(), durationMs: Date.now() - startedAt, resumeAt: null, resumeStepId: null },
      });
      return;
    }

    const state: WalkState = {
      tx,
      organizationId,
      runId,
      loaded,
      seeking: true,
      resumeStepId: run.resumeStepId,
      order: existing,
      suspend: null,
    };
    const signal = await walkLane(state, tree);
    await finalize(state, startedAt, signal);
  });
}
