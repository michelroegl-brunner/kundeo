/**
 * The trigger seam. CRM mutation actions call `emitEvent(...)` after a write;
 * the engine finds active workflows whose trigger matches and runs them. The
 * heavy work is deferred with `after()` so a user's save returns immediately and
 * an automation failure can never surface as an error on their action — failures
 * are caught here and recorded on the run, not thrown.
 *
 * Only triggers whose CRM mutation exists today are ever emitted (deal.stage,
 * contact.created/updated, company.created/updated, task.created/completed).
 * The rest (deal.created/won/lost, contact.tagged, task.overdue, schedule,
 * relative) are matched here already, so they start firing the moment their
 * write-site is added — no engine change needed.
 */
import "server-only";
import { after } from "next/server";
import { withOrg } from "@kundeo/db";
import { ensureActiveOrgId, getSession } from "@/lib/session";
import { loadRecord, evaluateAll, type RecordType } from "./records";
import type { FilterClause } from "@/components/automations/catalogue";
import { startRun } from "./runner";

export type TriggerKind =
  | "deal.created"
  | "deal.won"
  | "deal.lost"
  | "deal.stage"
  | "contact.created"
  | "contact.updated"
  | "contact.tagged"
  | "company.created"
  | "company.updated"
  | "task.created"
  | "task.completed"
  | "task.overdue";

export interface EventRecord {
  type: RecordType;
  id: string;
}

export interface EventMeta {
  /** For contact.tagged: the tag that was added. */
  tag?: string;
  /** For deal.stage: the stage the deal moved into. */
  stage?: string;
}

interface TriggerStepRow {
  kind: string;
  type: string;
  parentStepId: string | null;
  config: unknown;
}

function triggerConfig(steps: TriggerStepRow[]): { type: string; config: Record<string, unknown> } | null {
  const trigger = steps.find((s) => s.parentStepId === null && s.kind === "TRIGGER");
  if (!trigger) return null;
  return { type: trigger.type, config: (trigger.config ?? {}) as Record<string, unknown> };
}

/** Does this workflow's trigger match the event and qualify the record? */
function triggerMatches(
  steps: TriggerStepRow[],
  kind: TriggerKind,
  loaded: Parameters<typeof evaluateAll>[1],
  meta: EventMeta | undefined,
): boolean {
  const trigger = triggerConfig(steps);
  if (!trigger || trigger.type !== kind) return false;

  // Trigger-specific narrowing.
  if (kind === "deal.stage") {
    const want = typeof trigger.config.stage === "string" ? trigger.config.stage : null;
    if (want && meta?.stage && want !== meta.stage) return false;
  }
  if (kind === "contact.tagged") {
    const want = typeof trigger.config.tag === "string" ? trigger.config.tag : null;
    if (want && meta?.tag && want !== meta.tag) return false;
  }

  // Trigger filters ("nur wenn …") must all pass against the record.
  const filters = (trigger.config.filters as FilterClause[] | undefined) ?? [];
  return evaluateAll(filters, loaded);
}

async function dispatchEvent(
  kind: TriggerKind,
  record: EventRecord,
  actor: { organizationId: string; userId: string | null },
  meta: EventMeta | undefined,
): Promise<void> {
  // Match in one scoped transaction, then run each match in its own.
  const matchedIds = await withOrg(actor.organizationId, async (tx) => {
    const loaded = await loadRecord(tx, record.type, record.id);
    if (!loaded) return [];
    const workflows = await tx.workflow.findMany({
      where: { isActive: true },
      select: { id: true, steps: { select: { kind: true, type: true, parentStepId: true, config: true } } },
    });
    return workflows.filter((wf) => triggerMatches(wf.steps, kind, loaded, meta)).map((wf) => wf.id);
  });

  for (const workflowId of matchedIds) {
    try {
      await startRun({
        organizationId: actor.organizationId,
        workflowId,
        recordType: record.type,
        recordId: record.id,
        triggeredByUserId: actor.userId,
      });
    } catch (err) {
      console.error(`[automations] run failed workflow=${workflowId}`, err);
    }
  }
}

/**
 * Emit a trigger event from a CRM mutation. Resolves the actor in request scope,
 * then dispatches after the response so the caller is never blocked or broken by
 * automation work. Safe to call unconditionally; it no-ops without an org.
 */
export async function emitEvent(kind: TriggerKind, record: EventRecord, meta?: EventMeta): Promise<void> {
  let organizationId: string | null = null;
  try {
    organizationId = await ensureActiveOrgId();
  } catch {
    organizationId = null;
  }
  if (!organizationId) return;
  const orgId = organizationId;
  const session = await getSession();
  const userId = session?.user.id ?? null;

  after(async () => {
    try {
      await dispatchEvent(kind, record, { organizationId: orgId, userId }, meta);
    } catch (err) {
      console.error("[automations] dispatch failed", err);
    }
  });
}
