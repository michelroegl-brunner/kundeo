"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatTile } from "@/components/ui/stat-tile";
import { Tabs } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/ui/empty-state";
import { Toast } from "@/components/ui/toast";
import { createWorkflow, setWorkflowActive } from "@/app/(app)/automationen/actions";

export type LastStatus = "OK" | "ERROR" | "SKIPPED" | "TEST" | "RUNNING" | "WAITING" | "draft";

export interface AutomationRow {
  id: string;
  name: string;
  trigger: string;
  steps: number;
  branching: boolean;
  runs30: number;
  lastRunLabel: string | null;
  lastStatus: LastStatus;
  /** Plain-language reason shown on hover when the last run failed. */
  errorReason: string | null;
  active: boolean;
  ownerName: string;
}

export interface ListSummary {
  totalRuns30: number;
  /** OK ÷ (OK + ERROR) over the last 30 days, or null when nothing has run. */
  successRate: number | null;
}

function HeaderActions() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" size="sm" iconLeft="sparkles" onClick={() => router.push("/automationen/vorlagen")}>
        Vorlagen
      </Button>
      <Button
        size="sm"
        iconLeft="plus"
        loading={pending}
        onClick={() => startTransition(() => createWorkflow())}
      >
        Automation erstellen
      </Button>
    </div>
  );
}

function LastRunBadge({ status, reason }: { status: LastStatus; reason: string | null }) {
  if (status === "draft") return <Badge tone="neutral">Entwurf</Badge>;
  if (status === "ERROR")
    return (
      <Tooltip label={reason ?? "Der letzte Lauf ist fehlgeschlagen"}>
        <Badge tone="danger" icon="triangle-alert">Fehler</Badge>
      </Tooltip>
    );
  if (status === "SKIPPED") return <Badge tone="neutral">Übersprungen</Badge>;
  if (status === "TEST") return <Badge tone="brand" icon="flask-conical">Testlauf</Badge>;
  if (status === "WAITING") return <Badge tone="neutral" icon="hourglass">Wartet</Badge>;
  if (status === "RUNNING") return <Badge tone="brand" icon="loader-circle">Läuft</Badge>;
  return <Badge tone="success" dot>Erfolg</Badge>;
}

export function AutomationsList({ rows, summary }: { rows: AutomationRow[]; summary: ListSummary }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Optimistic copy, re-seeded when the server sends fresh data after toggling.
  const [list, setList] = useState(rows);
  useEffect(() => setList(rows), [rows]);

  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState("");
  const [toast, setToast] = useState<{ tone: "success" | "info"; title: string; description: string } | null>(null);

  const ownerOptions = useMemo(
    () => [...new Set(list.map((r) => r.ownerName).filter(Boolean))].sort().map((n) => ({ value: n, label: n })),
    [list],
  );

  const activeCount = list.filter((r) => r.active).length;
  const errorCount = list.filter((r) => r.lastStatus === "ERROR").length;

  const tabbed = useMemo(() => {
    if (tab === "active") return list.filter((r) => r.active);
    if (tab === "off") return list.filter((r) => !r.active);
    if (tab === "problem") return list.filter((r) => r.lastStatus === "ERROR");
    return list;
  }, [list, tab]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tabbed.filter(
      (r) => r.name.toLowerCase().includes(needle) && (!owner || r.ownerName === owner),
    );
  }, [tabbed, q, owner]);

  function toggle(row: AutomationRow, next: boolean) {
    const previous = list;
    setList((xs) => xs.map((x) => (x.id === row.id ? { ...x, active: next } : x)));
    setToast({
      tone: next ? "success" : "info",
      title: next ? "Automation eingeschaltet" : "Automation ausgeschaltet",
      description: row.name,
    });
    startTransition(async () => {
      try {
        await setWorkflowActive(row.id, next);
        router.refresh();
      } catch {
        setList(previous);
        setToast({ tone: "info", title: "Änderung nicht gespeichert", description: row.name });
      }
    });
  }

  const columns: DataTableColumn<AutomationRow>[] = [
    {
      key: "name",
      label: "Automation",
      width: "44%",
      render: (r) => (
        <span className="flex items-start gap-2.5">
          <span
            className="grid h-7 w-7 flex-none place-items-center rounded-md"
            style={{
              background: r.active ? "var(--surface-brand-subtle)" : "var(--surface-sunken)",
              color: r.active ? "var(--text-brand)" : "var(--text-subtle)",
            }}
          >
            <Icon name={r.branching ? "git-branch" : "workflow"} size={15} />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium text-content">{r.name}</span>
            <span className="mt-px line-clamp-2 text-2xs leading-normal text-content-muted">{r.trigger}</span>
          </span>
        </span>
      ),
    },
    { key: "steps", label: "Schritte", align: "right", mono: true, width: 90 },
    { key: "runs30", label: "Läufe/30 T.", align: "right", mono: true, width: 110 },
    {
      key: "lastRun",
      label: "Letzter Lauf",
      width: 200,
      render: (r) => (
        <span className="inline-flex items-center gap-2">
          <span className="font-mono text-xs text-content-muted">{r.lastRunLabel ?? "—"}</span>
          <LastRunBadge status={r.lastStatus} reason={r.errorReason} />
        </span>
      ),
    },
    {
      key: "owner",
      label: "Inhaber",
      width: 80,
      render: (r) => (r.ownerName ? <Avatar name={r.ownerName} size="xs" tone="neutral" /> : <span className="text-content-subtle">—</span>),
    },
    {
      key: "active",
      label: "Aktiv",
      align: "right",
      width: 90,
      render: (r) => (
        <span className="inline-flex justify-end" onClick={(e) => e.stopPropagation()}>
          <Switch checked={r.active} onChange={(on) => toggle(r, on)} />
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Automationen" actions={<HeaderActions />} />

      <div className="grid grid-cols-4 gap-4 max-md:grid-cols-2">
        <StatTile label="Aktive Automationen" value={String(activeCount)} unit={`von ${list.length}`} icon="workflow" tone="brand" />
        <StatTile label="Läufe (30 Tage)" value={summary.totalRuns30.toLocaleString("de-DE")} icon="play" />
        <StatTile
          label="Erfolgsquote"
          value={summary.successRate == null ? "—" : summary.successRate.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          unit={summary.successRate == null ? undefined : "%"}
          icon="circle-check"
          tone="success"
        />
        <StatTile label="Mit Fehler" value={String(errorCount)} unit="Automation" icon="triangle-alert" tone="warning" />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "all", label: "Alle", count: list.length },
          { id: "active", label: "Aktiv", count: activeCount },
          { id: "off", label: "Ausgeschaltet", count: list.filter((r) => !r.active).length },
          { id: "problem", label: "Mit Fehler", icon: "triangle-alert", count: errorCount },
        ]}
      />

      <div className="flex items-center gap-3">
        <Input
          size="sm"
          iconLeft="search"
          placeholder="Automation suchen …"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          fullWidth={false}
          style={{ width: 260 }}
        />
        <Select
          size="sm"
          fullWidth={false}
          placeholder="Alle Inhaber"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          options={ownerOptions}
          style={{ width: 180 }}
        />
        <span className="ml-auto font-mono text-xs tabular-nums text-content-muted">
          {filtered.length} von {list.length}
        </span>
      </div>

      <Card padding="none">
        <DataTable
          rows={filtered}
          columns={columns}
          onRowClick={(r) => router.push(`/automationen/${r.id}`)}
          emptyState={
            <EmptyState
              icon="workflow"
              title="Keine Automation gefunden"
              description="Passen Sie die Suche an oder starten Sie mit einer Vorlage."
              action={
                <Button size="sm" iconLeft="sparkles" onClick={() => router.push("/automationen/vorlagen")}>
                  Vorlage auswählen
                </Button>
              }
            />
          }
        />
      </Card>

      <div className="flex items-center gap-3 rounded-lg border border-edge bg-surface-card px-4 py-3">
        <Icon name="shield-check" size={16} color="var(--text-success)" />
        <span className="text-xs text-content-secondary">
          Jeder Lauf wird protokolliert: wer oder was ihn ausgelöst hat, welche Daten verändert und welche E-Mails
          versendet wurden. Protokolle bleiben 90 Tage in dieser Instanz.
        </span>
      </div>

      {toast ? (
        <div className="fixed bottom-6 right-6 z-50">
          <Toast tone={toast.tone} title={toast.title} description={toast.description} onClose={() => setToast(null)} />
        </div>
      ) : null}
    </>
  );
}

export function AutomationsFirstRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const steps: [string, string, string][] = [
    ["mouse-pointer-click", "Auslöser wählen", "Zum Beispiel: „Wenn ein Deal gewonnen wird“."],
    ["list", "Schritte stapeln", "Aufgaben, E-Mails, Wartezeiten — von oben nach unten."],
    ["flask-conical", "Testlauf starten", "Mit einem Beispieldatensatz. Es wird nichts wirklich gesendet."],
  ];
  return (
    <>
      <PageHeader title="Automationen" />
      <Card padding="lg">
        <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
          <span className="grid h-[52px] w-[52px] place-items-center rounded-xl bg-surface-brand-subtle text-content-brand">
            <Icon name="workflow" size={24} />
          </span>
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-content">Wiederkehrende Arbeit an Kundeo abgeben</h2>
            <p className="mx-auto mt-3 max-w-[440px] text-sm leading-relaxed text-content-secondary">
              Eine Automation besteht aus einem Auslöser und einer Liste von Schritten — in ganzen Sätzen, ohne
              Programmierung. Am schnellsten geht es mit einer Vorlage.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Button size="lg" iconLeft="sparkles" onClick={() => router.push("/automationen/vorlagen")}>
              Vorlage auswählen
            </Button>
            <Button
              size="lg"
              variant="secondary"
              iconLeft="plus"
              loading={pending}
              onClick={() => startTransition(() => createWorkflow())}
            >
              Leere Automation
            </Button>
          </div>
          <div className="mt-6 grid w-full max-w-[720px] grid-cols-3 gap-4 text-left max-md:grid-cols-1">
            {steps.map(([icon, title, desc], i) => (
              <div key={title} className="rounded-lg border border-edge bg-surface-page p-4">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-2xs text-content-subtle">{i + 1}</span>
                  <Icon name={icon} size={15} color="var(--text-brand)" />
                  <span className="text-xs font-semibold text-content">{title}</span>
                </div>
                <p className="mt-1.5 text-xs leading-normal text-content-muted">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </>
  );
}
