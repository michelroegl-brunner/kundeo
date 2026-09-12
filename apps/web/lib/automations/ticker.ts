/**
 * The in-process scheduler. A single interval sweeps for suspended runs whose
 * delay has elapsed (WorkflowRun.status = WAITING, resumeAt <= now) and resumes
 * each. This is the self-host durability story: delays survive restarts because
 * the wait lives in Postgres, not in a timer, and any Node process that boots
 * picks up due runs on its next tick.
 *
 * The sweep reads run ids across all tenants on the base (RLS-bypassing)
 * connection — a system-level operation by design — then resumes each run inside
 * its own org via withOrg, where RLS applies again.
 *
 * Each tick also fires due schedule- and relative-date-triggered workflows
 * (see ./schedules). Relative triggers only fire against date fields the schema
 * actually has (the deal close date); others are skipped, not faked.
 */
import "server-only";
import { prisma, withOrg } from "@kundeo/db";
import { resumeRun } from "./runner";
import { runDueSchedules, runDueRelative } from "./schedules";
import { processFreeFinanceJob } from "@/lib/freefinance/jobs";
import { drainDueDunning } from "@/lib/dunning/sweep";

const TICK_MS = 60_000;
const FIRST_TICK_MS = 10_000;
const BATCH = 50;

// FreeFinance job sweep: smaller batch (each does network I/O), a lease window
// so a second tick never double-runs a claimed job, and exponential backoff
// (1, 2, 4, 8 … minutes) between attempts.
const FF_BATCH = 20;
const FF_LEASE_MS = 120_000;
const FF_BACKOFF_BASE_MS = 60_000;

/** Resume every suspended run whose delay is due. Returns how many ran. */
export async function drainDueRuns(now: Date = new Date()): Promise<number> {
  const due = await prisma.workflowRun.findMany({
    where: { status: "WAITING", resumeAt: { lte: now } },
    select: { id: true, organizationId: true },
    orderBy: { resumeAt: "asc" },
    take: BATCH,
  });
  let ran = 0;
  for (const run of due) {
    try {
      await resumeRun(run.organizationId, run.id);
      ran++;
    } catch (err) {
      console.error(`[automations] resume failed run=${run.id}`, err);
    }
  }
  return ran;
}

/** Write a job's final outcome to the run-step it came from (and, on error,
 *  downgrade a still-OK run to ERROR — matching the email/webhook outbox). */
async function annotateRunStep(
  organizationId: string,
  runId: string | null,
  stepRowId: string,
  status: "OK" | "ERROR",
  message: string,
  errorCode?: string,
): Promise<void> {
  await withOrg(organizationId, async (tx) => {
    await tx.workflowRunStep.update({
      where: { id: stepRowId },
      data: { status, message, errorCode: errorCode ?? null },
    });
    if (status === "ERROR" && runId) {
      await tx.workflowRun.updateMany({ where: { id: runId, status: "OK" }, data: { status: "ERROR" } });
    }
  });
}

/**
 * Sweep due FreeFinance sync jobs across all tenants. Each job is claimed with a
 * lease (its runAt is pushed beyond the window so no concurrent tick re-selects
 * it), then processed outside any transaction. Success marks it DONE; a
 * transient failure reschedules with exponential backoff until maxAttempts, then
 * marks it FAILED. Customer sync is idempotent (ExternalRef + PUT); a v1 caveat
 * is that a crash mid-invoice-create could, on a later retry, create a second
 * draft — acceptable for the single-process self-host ticker.
 */
export async function drainDueFreeFinanceJobs(now: Date = new Date()): Promise<number> {
  const due = await prisma.freeFinanceSyncJob.findMany({
    where: { status: "PENDING", runAt: { lte: now } },
    orderBy: { runAt: "asc" },
    take: FF_BATCH,
  });
  let ran = 0;
  for (const job of due) {
    // Claim by leasing: only the tick that moves runAt forward owns the job.
    const claimed = await prisma.freeFinanceSyncJob.updateMany({
      where: { id: job.id, status: "PENDING", runAt: { lte: now } },
      data: { runAt: new Date(now.getTime() + FF_LEASE_MS), attempts: { increment: 1 } },
    });
    if (claimed.count !== 1) continue;
    const attempt = job.attempts + 1;
    try {
      const { message, documentId } = await processFreeFinanceJob(job.organizationId, job);
      await prisma.freeFinanceSyncJob.update({
        where: { id: job.id },
        data: { status: "DONE", lastError: null, documentId: documentId ?? job.documentId },
      });
      if (job.runStepId) await annotateRunStep(job.organizationId, job.runId, job.runStepId, "OK", message);
      ran++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt >= job.maxAttempts) {
        await prisma.freeFinanceSyncJob.update({ where: { id: job.id }, data: { status: "FAILED", lastError: msg } });
        if (job.runStepId) await annotateRunStep(job.organizationId, job.runId, job.runStepId, "ERROR", `FreeFinance: ${msg}`, "FF_SYNC_FAILED");
      } else {
        const delay = FF_BACKOFF_BASE_MS * 2 ** (attempt - 1);
        await prisma.freeFinanceSyncJob.update({
          where: { id: job.id },
          data: { runAt: new Date(Date.now() + delay), lastError: msg },
        });
      }
    }
  }
  return ran;
}

/**
 * Start the interval once per process. Guarded on a global so Next's dev HMR and
 * repeated instrumentation loads don't stack multiple tickers. The timers are
 * unref'd so they never hold the process open on shutdown.
 */
export function startTicker(): void {
  const g = globalThis as unknown as { __kundeoAutomationTicker?: boolean };
  if (g.__kundeoAutomationTicker) return;
  g.__kundeoAutomationTicker = true;

  const tick = () => {
    void drainDueRuns().catch((err) => console.error("[automations] ticker error", err));
    void runDueSchedules().catch((err) => console.error("[automations] schedule error", err));
    void runDueRelative().catch((err) => console.error("[automations] relative error", err));
    void drainDueFreeFinanceJobs().catch((err) => console.error("[automations] freefinance job error", err));
    void drainDueDunning().catch((err) => console.error("[dunning] sweep error", err));
  };
  const interval = setInterval(tick, TICK_MS);
  if (typeof interval.unref === "function") interval.unref();
  const first = setTimeout(tick, FIRST_TICK_MS);
  if (typeof first.unref === "function") first.unref();
}
