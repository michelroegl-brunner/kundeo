import { notFound } from "next/navigation";
import { scoped } from "@/lib/session";
import { formatRunTime } from "@/lib/format";
import { stepSentence, filterText, type FilterClause } from "@/components/automations/catalogue";
import { RunHistory, type RunView, type RunKpis } from "@/components/automations/run-history";

export const dynamic = "force-dynamic";

const THIRTY_DAYS = 30 * 86_400_000;

function durationLabel(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return "—";
  return `${(ms / 1000).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
}

export default async function RunLogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const workflow = await scoped(async (db) => {
    const wf = await db.workflow.findUnique({
      where: { id },
      include: {
        steps: { select: { id: true, kind: true, type: true, config: true, branchPath: true } },
        runs: {
          orderBy: { startedAt: "desc" },
          include: { steps: { orderBy: { order: "asc" } } },
        },
      },
    });
    if (!wf) return null;
    const members = await db.member.findMany({ include: { user: { select: { id: true, name: true } } } });
    const dealIds = [...new Set(wf.runs.filter((r) => r.recordType === "Deal" && r.recordId).map((r) => r.recordId!))];
    const deals = dealIds.length
      ? await db.deal.findMany({ where: { id: { in: dealIds } }, select: { id: true, title: true } })
      : [];
    return { wf, members, deals };
  });

  if (!workflow) notFound();
  const { wf, members, deals } = workflow;

  const nameById = new Map(members.map((m) => [m.user.id, m.user.name]));
  const dealTitleById = new Map(deals.map((d) => [d.id, d.title]));
  const stepById = new Map(wf.steps.map((s) => [s.id, s]));
  const trigger = wf.steps.find((s) => s.kind === "TRIGGER");
  const triggerFilters = ((trigger?.config as { filters?: FilterClause[] } | null)?.filters ?? []).map(filterText);

  const runs: RunView[] = wf.runs.map((run) => {
    const byName = run.triggeredByUserId ? (nameById.get(run.triggeredByUserId) ?? "System") : "System";

    const trace = run.steps.map((rs) => {
      const step = stepById.get(rs.stepId);
      const lane = step?.branchPath === "YES" ? "Ja" : step?.branchPath === "NO" ? "Nein" : null;
      const isDelay = step?.kind === "DELAY";
      const cfg = (step?.config ?? {}) as Record<string, unknown>;
      const dur = isDelay ? `${cfg.amount ?? "?"} ${cfg.unit ?? "Tage"}` : durationLabel(rs.durationMs);
      return {
        sentence: step ? stepSentence(step.type, step.config) : "Gelöschter Schritt",
        status: rs.status as "OK" | "ERROR" | "SKIPPED",
        laneLabel: lane,
        durationLabel: dur,
        message: rs.message ?? "",
        errorCode: rs.errorCode,
      };
    });

    const done = trace.filter((t) => t.status === "OK").length;
    const okCount = (type: string) =>
      run.steps.filter((rs) => rs.status === "OK" && stepById.get(rs.stepId)?.type === type).length;
    const changes: [string, string][] = [
      ["Aufgaben angelegt", String(okCount("task.create"))],
      ["E-Mails versendet", String(okCount("email.send"))],
      ["Notizen hinzugefügt", String(okCount("note.add"))],
      ["Datensätze berührt", run.recordType ? `1 ${run.recordType}` : "0"],
    ];

    return {
      id: run.id,
      whenLabel: formatRunTime(run.startedAt),
      record: (run.recordId && dealTitleById.get(run.recordId)) ?? run.recordId ?? "—",
      recordType: run.recordType ?? "Datensatz",
      byName,
      status: run.status,
      durationLabel: durationLabel(run.durationMs),
      stepsTotal: trace.length,
      stepsDone: done,
      trace,
      changes,
    };
  });

  const cutoff = Date.now() - THIRTY_DAYS;
  const recent = wf.runs.filter((r) => r.status !== "TEST" && r.startedAt.getTime() >= cutoff);
  const okN = recent.filter((r) => r.status === "OK").length;
  const errN = recent.filter((r) => r.status === "ERROR").length;
  const durs = recent.map((r) => r.durationMs ?? 0).filter((d) => d > 0);
  const avgMs = durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : 0;
  const kpis: RunKpis = {
    runs30: recent.length,
    ok: okN,
    error: errN,
    avgDurationLabel: avgMs ? (avgMs / 1000).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—",
  };

  return (
    <RunHistory
      workflow={{ id: wf.id, name: wf.name }}
      runs={runs}
      kpis={kpis}
      triggerFilters={triggerFilters}
    />
  );
}
