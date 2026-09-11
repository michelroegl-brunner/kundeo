"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatTile } from "@/components/ui/stat-tile";
import { Tabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/empty-state";
import { Toast } from "@/components/ui/toast";

type RunStatus = "OK" | "ERROR" | "SKIPPED" | "TEST" | "RUNNING" | "WAITING";
type StepStatus = "OK" | "ERROR" | "SKIPPED";

export interface TraceItem {
  sentence: string;
  status: StepStatus;
  laneLabel: string | null;
  durationLabel: string;
  message: string;
  errorCode: string | null;
}

export interface RunView {
  id: string;
  whenLabel: string;
  record: string;
  recordType: string;
  byName: string;
  status: RunStatus;
  durationLabel: string;
  stepsTotal: number;
  stepsDone: number;
  trace: TraceItem[];
  changes: [string, string][];
}

export interface RunKpis {
  runs30: number;
  ok: number;
  error: number;
  avgDurationLabel: string;
}

const STATUS: Record<RunStatus, { tone: "success" | "danger" | "neutral" | "brand"; label: string }> = {
  OK: { tone: "success", label: "Erfolgreich" },
  ERROR: { tone: "danger", label: "Fehler" },
  SKIPPED: { tone: "neutral", label: "Übersprungen" },
  TEST: { tone: "brand", label: "Testlauf" },
  RUNNING: { tone: "brand", label: "Läuft" },
  WAITING: { tone: "neutral", label: "Wartet" },
};

const STEP_ICON: Record<StepStatus, string> = { OK: "circle-check", ERROR: "circle-x", SKIPPED: "circle-minus" };

const FIX_BY_CODE: Record<string, string> = {
  TEMPLATE_MISSING:
    "Die verwendete E-Mail-Vorlage existiert nicht mehr. Wählen Sie im Schritt eine andere Vorlage aus — danach können Sie diesen Lauf wiederholen.",
};

function fixText(code: string | null): string {
  return (code && FIX_BY_CODE[code]) || "Öffnen Sie den Schritt, prüfen Sie die Angaben und wiederholen Sie den Lauf.";
}

function stepColor(status: StepStatus): string {
  return status === "ERROR" ? "var(--text-danger)" : status === "SKIPPED" ? "var(--text-subtle)" : "var(--text-success)";
}

function TraceStep({
  step,
  last,
  onOpenStep,
  onRetryStep,
}: {
  step: TraceItem;
  last: boolean;
  onOpenStep: () => void;
  onRetryStep: () => void;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-none flex-col items-center">
        <span
          className="grid h-7 w-7 place-items-center rounded-full border border-edge bg-surface-card"
          style={{ color: stepColor(step.status) }}
        >
          <Icon name={STEP_ICON[step.status]} size={14} />
        </span>
        {!last ? <span className="mt-1 w-px flex-1" style={{ background: "var(--border-default)" }} /> : null}
      </div>
      <div className={`min-w-0 flex-1 ${last ? "" : "pb-4"}`}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-content">{step.sentence}</p>
          {step.laneLabel ? <Badge tone="neutral" icon="git-branch">Pfad {step.laneLabel}</Badge> : null}
          <span className="ml-auto font-mono text-2xs text-content-subtle">{step.durationLabel}</span>
        </div>
        {step.message ? (
          <p className="mt-1 text-xs leading-normal" style={{ color: step.status === "ERROR" ? "var(--text-danger)" : "var(--text-secondary)" }}>
            {step.message}
          </p>
        ) : null}
        {step.status === "ERROR" ? (
          <div className="mt-2 rounded-md p-3" style={{ background: "var(--surface-danger-subtle)", border: "1px solid var(--red-500)" }}>
            <p className="text-xs font-semibold text-content">Was ist passiert?</p>
            <p className="mb-3 mt-1 text-xs leading-normal text-content-secondary">{fixText(step.errorCode)}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" iconLeft="rotate-ccw" onClick={onRetryStep}>Schritt wiederholen</Button>
              <Button size="sm" variant="secondary" iconLeft="settings" onClick={onOpenStep}>Schritt öffnen</Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RunDetail({
  run,
  triggerFilters,
  onBack,
  onEdit,
  onRetryInfo,
}: {
  run: RunView;
  triggerFilters: string[];
  onBack: () => void;
  onEdit: () => void;
  onRetryInfo: () => void;
}) {
  const s = STATUS[run.status];
  return (
    <>
      <Card>
        <div className="flex flex-wrap items-start gap-4">
          <Button variant="secondary" size="sm" iconLeft="arrow-left" onClick={onBack}>Alle Läufe</Button>
          <div className="flex min-w-[240px] flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold tracking-snug text-content">Lauf vom {run.whenLabel}</h2>
              <Badge tone={s.tone} dot>{s.label}</Badge>
            </div>
            <p className="text-sm leading-normal text-content-secondary">
              Ausgelöst durch {run.recordType} <strong className="text-content">{run.record}</strong> · {run.byName} · Dauer {run.durationLabel}
            </p>
          </div>
          {run.status === "ERROR" ? <Button size="sm" iconLeft="rotate-ccw" onClick={onRetryInfo}>Lauf wiederholen</Button> : null}
        </div>
      </Card>

      {run.status === "TEST" ? (
        <div className="flex items-center gap-3 rounded-lg px-4 py-3" style={{ background: "var(--surface-brand-subtle)" }}>
          <Icon name="flask-conical" size={16} color="var(--text-brand)" />
          <span className="text-xs text-content">Das war ein Testlauf. Es wurden keine E-Mails versendet und keine Datensätze verändert.</span>
        </div>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)_300px] items-start gap-4 max-md:grid-cols-1">
        <Card title="Ablauf dieses Laufs" subtitle="Gleiche Reihenfolge wie im Baukasten">
          {run.trace.map((t, i) => (
            <TraceStep
              key={i}
              step={t}
              last={i === run.trace.length - 1}
              onOpenStep={onEdit}
              onRetryStep={onRetryInfo}
            />
          ))}
        </Card>
        <div className="flex flex-col gap-4">
          <Card title="Warum ist dieser Lauf gestartet?">
            <p className="text-xs leading-relaxed text-content-secondary">
              Ausgelöst durch {run.recordType} <strong className="text-content">{run.record}</strong> · {run.byName}.
              {triggerFilters.length ? " Die Einschränkung des Auslösers war erfüllt:" : " Der Auslöser hat ohne weitere Bedingung ausgelöst."}
            </p>
            {triggerFilters.map((f, i) => (
              <div key={i} className="mt-2 inline-flex items-center gap-1.5 rounded-sm bg-surface-sunken px-2.5 py-1 text-2xs text-content-secondary">
                <Icon name="filter" size={11} />
                {f}
              </div>
            ))}
          </Card>
          <Card title="Änderungen">
            {run.changes.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[1fr_auto] gap-3 border-b border-edge-subtle py-1.5">
                <span className="text-xs text-content-muted">{k}</span>
                <span className="font-mono text-xs text-content">{v}</span>
              </div>
            ))}
            <p className="mt-3 text-2xs leading-normal text-content-subtle">
              Protokolle bleiben 90 Tage in Ihrer Instanz und werden nicht an Dritte übertragen.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}

export function RunHistory({
  workflow,
  runs,
  kpis,
  triggerFilters,
}: {
  workflow: { id: string; name: string };
  runs: RunView[];
  kpis: RunKpis;
  triggerFilters: string[];
}) {
  const router = useRouter();
  const [runId, setRunId] = useState<string | null>(null);
  const [tab, setTab] = useState("all");
  const [toast, setToast] = useState<string | null>(null);

  const selected = runs.find((r) => r.id === runId) ?? null;

  const filtered = useMemo(() => {
    if (tab === "ok") return runs.filter((r) => r.status === "OK");
    if (tab === "error") return runs.filter((r) => r.status === "ERROR");
    if (tab === "test") return runs.filter((r) => r.status === "TEST");
    return runs;
  }, [runs, tab]);

  const retryInfo = () => setToast("Erneutes Ausführen wird verfügbar, sobald die Automatisierung aktiv ausführt.");

  const columns: DataTableColumn<RunView>[] = [
    { key: "when", label: "Zeitpunkt", mono: true, width: 170, render: (r) => r.whenLabel },
    {
      key: "record",
      label: "Ausgelöst durch",
      render: (r) => (
        <span>
          <span className="block font-medium text-content">{r.record}</span>
          <span className="block text-2xs text-content-subtle">{r.recordType} · {r.byName}</span>
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      width: 150,
      render: (r) => <Badge tone={STATUS[r.status].tone} dot>{STATUS[r.status].label}</Badge>,
    },
    { key: "steps", label: "Schritte", align: "right", mono: true, width: 90, render: (r) => `${r.stepsDone}/${r.stepsTotal}` },
    { key: "duration", label: "Dauer", align: "right", mono: true, width: 90, render: (r) => r.durationLabel },
    { key: "go", label: "", align: "right", width: 44, render: () => <Icon name="chevron-right" size={15} color="var(--text-subtle)" /> },
  ];

  return (
    <>
      <PageHeader
        title={workflow.name}
        breadcrumb={["Automationen", "Protokoll"]}
        actions={
          <Button variant="secondary" size="sm" iconLeft="pencil" onClick={() => router.push(`/automationen/${workflow.id}`)}>
            Automation bearbeiten
          </Button>
        }
      />

      {selected ? (
        <RunDetail
          run={selected}
          triggerFilters={triggerFilters}
          onBack={() => setRunId(null)}
          onEdit={() => router.push(`/automationen/${workflow.id}`)}
          onRetryInfo={retryInfo}
        />
      ) : (
        <>
          <div className="grid grid-cols-4 gap-4 max-md:grid-cols-2">
            <StatTile label="Läufe (30 Tage)" value={String(kpis.runs30)} icon="play" tone="brand" />
            <StatTile label="Erfolgreich" value={String(kpis.ok)} icon="circle-check" tone="success" />
            <StatTile label="Fehler" value={String(kpis.error)} icon="circle-x" tone="warning" />
            <StatTile label="Ø Dauer" value={kpis.avgDurationLabel} unit={kpis.avgDurationLabel === "—" ? undefined : "s"} icon="timer" />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Tabs
              value={tab}
              onChange={setTab}
              className="flex-1"
              tabs={[
                { id: "all", label: "Alle", count: runs.length },
                { id: "ok", label: "Erfolgreich", count: runs.filter((r) => r.status === "OK").length },
                { id: "error", label: "Fehler", icon: "triangle-alert", count: runs.filter((r) => r.status === "ERROR").length },
                { id: "test", label: "Testläufe", icon: "flask-conical", count: runs.filter((r) => r.status === "TEST").length },
              ]}
            />
          </div>

          <Card padding="none" title="Läufe der letzten 30 Tage">
            <DataTable
              rows={filtered}
              columns={columns}
              onRowClick={(r) => setRunId(r.id)}
              emptyState={<EmptyState icon="history" title="Keine Läufe" description="Für diesen Filter gibt es keine Einträge." />}
            />
          </Card>
        </>
      )}

      {toast ? (
        <div className="fixed bottom-6 right-6 z-50">
          <Toast tone="info" title="Noch nicht verfügbar" description={toast} onClose={() => setToast(null)} />
        </div>
      ) : null}
    </>
  );
}
