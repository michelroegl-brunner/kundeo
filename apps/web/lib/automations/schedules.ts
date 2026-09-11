/**
 * Schedule-triggered workflows. Unlike event triggers (one record), a schedule
 * fires on a cadence and fans out over a *set* of records. The record set is the
 * entity named by the workflow's first FILTER step ("Nur weiter wenn Firma …");
 * we pre-evaluate that filter here and start a run only for records that pass,
 * so the Protokoll isn't flooded with skipped runs. A schedule with no filter
 * runs once at the org level (no record).
 *
 * Relative-date triggers ("7 Tage vor dem Verlängerungsdatum") are not handled
 * yet: they reference date fields the schema does not have. Left unfired rather
 * than faked.
 */
import "server-only";
import { prisma, withOrg, type Prisma } from "@kundeo/db";
import type { FilterClause } from "@/components/automations/catalogue";
import { loadRecord, evaluateAll, type RecordType } from "./records";
import { startRun } from "./runner";

const WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const GERMAN_TO_TYPE: Record<string, RecordType> = { Firma: "Company", Kontakt: "Contact", Deal: "Deal" };
const FANOUT_CAP = 200;
const DUE_WINDOW_MIN = 2; // a tick lands within a couple of minutes of the target
const DEDUPE_MIN = 5;

interface StepRow {
  kind: string;
  type: string;
  parentStepId: string | null;
  config: unknown;
}

function isDue(config: Record<string, unknown>, now: Date): boolean {
  const time = typeof config.time === "string" ? config.time : "08:00";
  const [h, m] = time.split(":").map(Number);
  if (h == null || m == null || !Number.isFinite(h) || !Number.isFinite(m)) return false;
  const target = h * 60 + m;
  const cur = now.getHours() * 60 + now.getMinutes();
  if (cur < target || cur >= target + DUE_WINDOW_MIN) return false;
  const cron = typeof config.cron === "string" ? config.cron : "weekly";
  if (cron === "daily") return true;
  const weekday = typeof config.weekday === "string" ? config.weekday : null;
  return !weekday || WEEKDAYS[now.getDay()] === weekday;
}

function firstFilterEntity(steps: StepRow[]): string | null {
  const f = steps.find((s) => s.parentStepId === null && s.kind === "FILTER");
  const entity = (f?.config as { entity?: string } | undefined)?.entity;
  return typeof entity === "string" ? entity : null;
}

function mainFilterClauses(steps: StepRow[]): FilterClause[] {
  return steps
    .filter((s) => s.parentStepId === null && s.kind === "FILTER")
    .map((s) => s.config as FilterClause)
    .filter((c) => c && c.field);
}

async function listRecordIds(tx: Prisma.TransactionClient, type: RecordType): Promise<string[]> {
  const opts = { select: { id: true }, take: FANOUT_CAP } as const;
  if (type === "Company") return (await tx.company.findMany(opts)).map((r) => r.id);
  if (type === "Contact") return (await tx.contact.findMany(opts)).map((r) => r.id);
  if (type === "Deal") return (await tx.deal.findMany(opts)).map((r) => r.id);
  return [];
}

/** Fire every due schedule workflow, fanning out to filtered records. Returns runs started. */
export async function runDueSchedules(now: Date = new Date()): Promise<number> {
  const workflows = await prisma.workflow.findMany({
    where: { isActive: true, steps: { some: { kind: "TRIGGER", type: "schedule" } } },
    select: { id: true, organizationId: true, steps: { select: { kind: true, type: true, parentStepId: true, config: true } } },
  });

  let started = 0;
  for (const wf of workflows) {
    const trigger = wf.steps.find((s) => s.parentStepId === null && s.kind === "TRIGGER" && s.type === "schedule");
    if (!trigger || !isDue((trigger.config ?? {}) as Record<string, unknown>, now)) continue;

    // Dedupe: don't fire again if this workflow already ran in the window.
    const recent = await prisma.workflowRun.findFirst({
      where: { workflowId: wf.id, startedAt: { gte: new Date(now.getTime() - DEDUPE_MIN * 60_000) } },
      select: { id: true },
    });
    if (recent) continue;

    const entity = firstFilterEntity(wf.steps);
    const type = entity ? GERMAN_TO_TYPE[entity] : null;

    if (!type) {
      // No record set to fan out over → a single org-level run.
      await startRun({ organizationId: wf.organizationId, workflowId: wf.id, recordType: null, recordId: null });
      started++;
      continue;
    }

    // Pre-filter the record set so only matching records start a run.
    const filters = mainFilterClauses(wf.steps);
    const passing = await withOrg(wf.organizationId, async (tx) => {
      const ids = await listRecordIds(tx, type);
      const out: string[] = [];
      for (const id of ids) {
        const loaded = await loadRecord(tx, type, id);
        if (loaded && evaluateAll(filters, loaded)) out.push(id);
      }
      return out;
    });

    for (const id of passing) {
      await startRun({ organizationId: wf.organizationId, workflowId: wf.id, recordType: type, recordId: id });
    }
    started += passing.length;
  }
  return started;
}
