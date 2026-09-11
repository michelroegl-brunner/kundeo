import { getSession, scoped } from "@/lib/session";
import { formatRunTime } from "@/lib/format";
import { triggerSummary } from "@/components/automations/catalogue";
import {
  AutomationsList,
  AutomationsFirstRun,
  type AutomationRow,
  type LastStatus,
} from "@/components/automations/automations-list";

export const dynamic = "force-dynamic";

const THIRTY_DAYS = 30 * 86_400_000;

export default async function AutomationenPage() {
  await getSession();

  const { workflows, members } = await scoped(async (db) => {
    const [workflows, members] = await Promise.all([
      db.workflow.findMany({
        include: {
          steps: { select: { kind: true, type: true, parentStepId: true, config: true } },
          runs: { select: { status: true, startedAt: true }, orderBy: { startedAt: "desc" } },
        },
        orderBy: { updatedAt: "desc" },
      }),
      db.member.findMany({ include: { user: { select: { id: true, name: true } } } }),
    ]);
    return { workflows, members };
  });

  if (workflows.length === 0) return <AutomationsFirstRun />;

  const nameById = new Map(members.map((m) => [m.user.id, m.user.name]));
  const cutoff = Date.now() - THIRTY_DAYS;
  let totalRuns30 = 0;
  let ok30 = 0;
  let err30 = 0;

  const rows: AutomationRow[] = workflows.map((w) => {
    const trigger = w.steps.find((s) => s.kind === "TRIGGER" && s.parentStepId === null);
    const real = w.runs.filter((r) => r.status !== "TEST");
    const runs30 = real.filter((r) => r.startedAt.getTime() >= cutoff).length;
    totalRuns30 += runs30;
    for (const r of real) {
      if (r.startedAt.getTime() < cutoff) continue;
      if (r.status === "OK") ok30 += 1;
      else if (r.status === "ERROR") err30 += 1;
    }

    const last = w.runs[0];
    const lastStatus: LastStatus = last ? last.status : "draft";

    return {
      id: w.id,
      name: w.name,
      trigger: trigger ? triggerSummary(trigger.type, trigger.config) : "Kein Auslöser gewählt",
      steps: w.steps.length,
      branching: w.steps.some((s) => s.kind === "BRANCH"),
      runs30,
      lastRunLabel: last ? formatRunTime(last.startedAt) : null,
      lastStatus,
      errorReason:
        lastStatus === "ERROR" ? "Der letzte Lauf ist fehlgeschlagen — Details im Protokoll." : null,
      active: w.isActive,
      ownerName: nameById.get(w.createdBy) ?? "",
    };
  });

  const denom = ok30 + err30;
  const successRate = denom > 0 ? Math.round((ok30 / denom) * 1000) / 10 : null;

  return <AutomationsList rows={rows} summary={{ totalRuns30, successRate }} />;
}
