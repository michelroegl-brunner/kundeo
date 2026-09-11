"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Radio } from "@/components/ui/radio";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { Toast, type ToastProps } from "@/components/ui/toast";
import {
  saveOrganization,
  savePreferences,
  addStage,
  saveStages,
  removeStage,
  createPipeline,
  renamePipeline,
  setDefaultPipeline,
  deletePipeline,
  type ActionResult,
} from "@/app/(app)/settings/actions";

const CURRENCY_OPTIONS = [
  { value: "EUR", label: "Euro (EUR)" },
  { value: "CHF", label: "Schweizer Franken (CHF)" },
];
const COUNTRY_OPTIONS = [
  { value: "DE", label: "Deutschland" },
  { value: "AT", label: "Österreich" },
  { value: "CH", label: "Schweiz" },
];
const TZ_OPTIONS = ["Europe/Berlin", "Europe/Vienna", "Europe/Zurich"];

export interface StageItem {
  id: string;
  name: string;
  probability: number;
  deals: number;
}

export interface PipelineItem {
  id: string;
  name: string;
  isDefault: boolean;
  stages: StageItem[];
}

export interface NotificationPrefs {
  email: { newActivities: boolean; dueTasks: boolean; dealWonLost: boolean; weeklyPipeline: boolean };
  inApp: { assignments: boolean; mentions: boolean; stageChanges: boolean };
  summary: string;
}

export interface InstanceInfo {
  baseUrl: string;
  version: string;
  database: string;
  license: string;
  status: { label: string; tone: "success" | "warning" | "danger" | "neutral"; value: string }[];
}

export interface SettingsViewProps {
  org: { name: string; slug: string; currency: string; country: string; vatId: string; timezone: string };
  orgIdMasked: string;
  pipelines: PipelineItem[];
  prefs: NotificationPrefs;
  instance: InstanceInfo;
}

export function SettingsView({ org, orgIdMasked, pipelines, prefs, instance }: SettingsViewProps) {
  const router = useRouter();
  const [tab, setTab] = useState("org");
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<ToastProps | null>(null);

  function run(fn: () => Promise<ActionResult>, ok: ToastProps, after?: () => void) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setToast(ok);
        after?.();
        router.refresh();
      } else {
        setToast({ tone: "danger", title: "Aktion fehlgeschlagen", description: res.error });
      }
    });
  }

  const tabs = [
    { id: "org", label: "Organisation", icon: "building-2" },
    { id: "pipelines", label: "Pipelines", icon: "kanban" },
    { id: "notifications", label: "Benachrichtigungen", icon: "bell" },
    { id: "instance", label: "Instanz", icon: "server" },
  ];

  return (
    <>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === "org" ? (
        <OrgTab org={org} orgIdMasked={orgIdMasked} pending={pending} run={run} />
      ) : tab === "pipelines" ? (
        <PipelinesTab pipelines={pipelines} pending={pending} run={run} />
      ) : tab === "notifications" ? (
        <NotificationsTab prefs={prefs} pending={pending} run={run} />
      ) : (
        <InstanceTab instance={instance} />
      )}

      {toast ? (
        <div className="fixed bottom-6 right-6 z-[70]">
          <Toast {...toast} onClose={() => setToast(null)} />
        </div>
      ) : null}
    </>
  );
}

type RunFn = (fn: () => Promise<ActionResult>, ok: ToastProps, after?: () => void) => void;

function OrgTab({
  org,
  orgIdMasked,
  pending,
  run,
}: {
  org: SettingsViewProps["org"];
  orgIdMasked: string;
  pending: boolean;
  run: RunFn;
}) {
  const [form, setForm] = useState(org);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const dirty = JSON.stringify(form) !== JSON.stringify(org);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_320px] items-start gap-4 max-lg:grid-cols-1">
      <Card
        title="Organisation"
        subtitle="Mandant dieser Instanz"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" disabled={!dirty} onClick={() => setForm(org)}>
              Verwerfen
            </Button>
            <Button
              size="sm"
              loading={pending}
              disabled={!dirty || !form.name.trim()}
              onClick={() => run(() => saveOrganization(form), { tone: "success", title: "Änderungen gespeichert" })}
            >
              Speichern
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field label="Name" required>
            <Input value={form.name} onChange={(e) => set("name")(e.target.value)} />
          </Field>
          <Field label="Slug" hint="Teil der URL, nachträglich änderbar">
            <Input mono value={form.slug} onChange={(e) => set("slug")(e.target.value)} />
          </Field>
          <Field label="Standardwährung">
            <Select value={form.currency} onChange={(e) => set("currency")(e.target.value)} options={CURRENCY_OPTIONS} />
          </Field>
          <Field label="Land">
            <Select value={form.country} onChange={(e) => set("country")(e.target.value)} options={COUNTRY_OPTIONS} />
          </Field>
          <Field label="USt-IdNr.">
            <Input mono value={form.vatId} onChange={(e) => set("vatId")(e.target.value)} placeholder="DE123456789" />
          </Field>
          <Field label="Zeitzone">
            <Select value={form.timezone} onChange={(e) => set("timezone")(e.target.value)} options={TZ_OPTIONS} />
          </Field>
        </div>
      </Card>

      <Card title="Mandantentrennung">
        <p className="font-sans text-xs leading-relaxed text-content-secondary">
          Jeder Datensatz trägt die <span className="font-mono">organizationId</span> dieser Organisation. Die Trennung
          erzwingt PostgreSQL Row-Level Security.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Badge tone="success" dot>
            RLS aktiv
          </Badge>
          <span className="font-mono text-2xs text-content-subtle">{orgIdMasked}</span>
        </div>
      </Card>
    </div>
  );
}

function PipelinesTab({ pipelines, pending, run }: { pipelines: PipelineItem[]; pending: boolean; run: RunFn }) {
  const [selectedId, setSelectedId] = useState(pipelines[0]?.id ?? "");
  const [newName, setNewName] = useState("");
  const selected = pipelines.find((p) => p.id === selectedId) ?? pipelines[0];

  return (
    <div className="flex flex-col gap-4">
      <Card title="Pipelines" subtitle="Vertriebsprozesse Ihrer Organisation">
        <div className="flex flex-col gap-2">
          {pipelines.map((p) => {
            const totalDeals = p.stages.reduce((a, s) => a + s.deals, 0);
            const active = p.id === selected?.id;
            return (
              <div
                key={p.id}
                className={
                  "flex items-center gap-3 rounded-md border p-3 " +
                  (active ? "border-edge-brand bg-surface-brand-subtle" : "border-edge")
                }
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className="min-w-0 flex-1 cursor-pointer text-left font-sans text-sm font-medium text-content"
                >
                  {p.name}
                </button>
                {p.isDefault ? (
                  <Badge tone="success">Standard</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={pending}
                    onClick={() => run(() => setDefaultPipeline(p.id), { tone: "success", title: "Standard-Pipeline gesetzt" })}
                  >
                    Als Standard
                  </Button>
                )}
                <span className="w-[90px] text-right font-sans text-xs text-content-muted">
                  {p.stages.length} Phasen · {totalDeals} Deals
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  iconLeft="trash-2"
                  disabled={pipelines.length <= 1 || totalDeals > 0}
                  onClick={() => run(() => deletePipeline(p.id), { tone: "success", title: "Pipeline gelöscht" })}
                >
                  Löschen
                </Button>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Input
            size="sm"
            placeholder="Name der neuen Pipeline …"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            fullWidth={false}
            style={{ width: 240 }}
          />
          <Button
            size="sm"
            variant="secondary"
            iconLeft="plus"
            loading={pending}
            disabled={!newName.trim()}
            onClick={() =>
              run(() => createPipeline(newName), { tone: "success", title: "Pipeline angelegt" }, () => setNewName(""))
            }
          >
            Pipeline anlegen
          </Button>
        </div>
      </Card>

      {selected ? <StageEditor key={selected.id} pipeline={selected} pending={pending} run={run} /> : null}
    </div>
  );
}

function StageEditor({ pipeline, pending, run }: { pipeline: PipelineItem; pending: boolean; run: RunFn }) {
  const [name, setName] = useState(pipeline.name);
  const [rows, setRows] = useState(pipeline.stages);
  const stagesDirty =
    JSON.stringify(rows.map((r) => ({ id: r.id, name: r.name, probability: r.probability }))) !==
    JSON.stringify(pipeline.stages.map((r) => ({ id: r.id, name: r.name, probability: r.probability })));

  const update = (id: string, patch: Partial<StageItem>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <Card
      title={`Phasen · ${pipeline.name}`}
      subtitle="Phasen und Wahrscheinlichkeiten für die gewählte Pipeline"
      actions={
        <Button
          variant="ghost"
          size="sm"
          iconLeft="plus"
          loading={pending}
          onClick={() => run(() => addStage(pipeline.id), { tone: "success", title: "Phase angelegt" })}
        >
          Phase
        </Button>
      }
      footer={
        <div className="flex justify-end">
          <Button
            size="sm"
            loading={pending}
            disabled={!stagesDirty}
            onClick={() =>
              run(
                () => saveStages(rows.map((r) => ({ id: r.id, name: r.name, probability: r.probability }))),
                { tone: "success", title: "Phasen gespeichert" },
              )
            }
          >
            Speichern
          </Button>
        </div>
      }
    >
      <div className="mb-4 flex items-end gap-2">
        <Field label="Pipeline-Name" className="flex-1">
          <Input size="sm" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button
          size="sm"
          variant="secondary"
          loading={pending}
          disabled={name.trim() === pipeline.name || !name.trim()}
          onClick={() => run(() => renamePipeline(pipeline.id, name), { tone: "success", title: "Pipeline umbenannt" })}
        >
          Umbenennen
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {rows.map((s, i) => (
          <div key={s.id} className="flex items-center gap-3 rounded-md border border-edge p-3">
            <Icon name="grip-vertical" size={15} color="var(--text-subtle)" />
            <span className="w-[18px] font-mono text-2xs text-content-subtle">{i + 1}</span>
            <Input
              size="sm"
              value={s.name}
              onChange={(e) => update(s.id, { name: e.target.value })}
              fullWidth={false}
              style={{ width: 200 }}
            />
            <Input
              size="sm"
              mono
              align="right"
              suffix="%"
              type="number"
              value={String(s.probability)}
              onChange={(e) => update(s.id, { probability: Number(e.target.value) || 0 })}
              fullWidth={false}
              style={{ width: 110 }}
            />
            <span className="ml-auto font-sans text-xs text-content-muted">{s.deals} Deals</span>
            <Button
              size="sm"
              variant="ghost"
              iconLeft="trash-2"
              disabled={s.deals > 0 || rows.length <= 1}
              onClick={() => run(() => removeStage(s.id), { tone: "success", title: "Phase entfernt" })}
            >
              Entfernen
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function NotificationsTab({ prefs, pending, run }: { prefs: NotificationPrefs; pending: boolean; run: RunFn }) {
  const [state, setState] = useState(prefs);
  const dirty = JSON.stringify(state) !== JSON.stringify(prefs);
  const email = (k: keyof NotificationPrefs["email"]) => (v: boolean) =>
    setState((s) => ({ ...s, email: { ...s.email, [k]: v } }));
  const inApp = (k: keyof NotificationPrefs["inApp"]) => (v: boolean) =>
    setState((s) => ({ ...s, inApp: { ...s.inApp, [k]: v } }));

  return (
    <>
      <div className="grid grid-cols-2 items-start gap-4 max-md:grid-cols-1">
        <Card title="E-Mail">
          <div className="flex flex-col gap-4">
            <Switch label="Neue Aktivitäten an meinen Deals" hint="Sofort, gebündelt pro Stunde" checked={state.email.newActivities} onChange={email("newActivities")} />
            <Switch label="Fällige Aufgaben" hint="Täglich um 08:00" checked={state.email.dueTasks} onChange={email("dueTasks")} />
            <Switch label="Deal gewonnen oder verloren" checked={state.email.dealWonLost} onChange={email("dealWonLost")} />
            <Switch label="Wöchentliche Pipeline-Zusammenfassung" hint="Montags um 07:00" checked={state.email.weeklyPipeline} onChange={email("weeklyPipeline")} />
          </div>
        </Card>
        <Card title="In der Anwendung">
          <div className="flex flex-col gap-3">
            <Checkbox label="Zuweisungen an mich" checked={state.inApp.assignments} onChange={inApp("assignments")} />
            <Checkbox label="Erwähnungen in Notizen" checked={state.inApp.mentions} onChange={inApp("mentions")} />
            <Checkbox label="Phasenwechsel im Team" checked={state.inApp.stageChanges} onChange={inApp("stageChanges")} />
          </div>
          <div className="mt-5">
            <p className="mb-2 font-sans text-xs font-medium text-content-secondary">Zusammenfassung</p>
            <Radio
              direction="row"
              value={state.summary}
              onChange={(v) => setState((s) => ({ ...s, summary: v }))}
              options={[
                { value: "instant", label: "Sofort" },
                { value: "daily", label: "Täglich" },
                { value: "weekly", label: "Wöchentlich" },
              ]}
            />
          </div>
        </Card>
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          loading={pending}
          disabled={!dirty}
          onClick={() =>
            run(() => savePreferences(state as unknown as Record<string, unknown>), {
              tone: "success",
              title: "Einstellungen gespeichert",
            })
          }
        >
          Speichern
        </Button>
      </div>
    </>
  );
}

function InstanceTab({ instance }: { instance: InstanceInfo }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_320px] items-start gap-4 max-lg:grid-cols-1">
      <Card title="Instanz" subtitle="Selbst gehostet">
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field label="Basis-URL">
            <Input mono value={instance.baseUrl} readOnly />
          </Field>
          <Field label="Version">
            <Input mono value={instance.version} readOnly />
          </Field>
          <Field label="Datenbank" hint="DATABASE_URL aus .env">
            <Input mono value={instance.database} readOnly />
          </Field>
          <Field label="Lizenz">
            <Input value={instance.license} readOnly />
          </Field>
        </div>
        <div className="mt-4 flex gap-2">
          <a
            href="/api/export"
            className="inline-flex h-[var(--control-height-sm)] items-center gap-1.5 rounded-md border border-edge bg-surface-card px-[10px] font-sans text-xs font-medium tracking-snug text-content shadow-xs transition duration-[120ms] ease-out hover:bg-surface-hover hover:border-edge-strong focus-visible:outline-none focus-visible:[box-shadow:var(--ring-brand)]"
          >
            <Icon name="download" size={14} />
            Daten exportieren
          </a>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-[var(--control-height-sm)] items-center gap-1.5 rounded-md px-[10px] font-sans text-xs font-medium tracking-snug text-content-secondary transition duration-[120ms] ease-out hover:bg-surface-active focus-visible:outline-none focus-visible:[box-shadow:var(--ring-brand)]"
          >
            <Icon name="book-open" size={14} />
            Dokumentation
          </a>
        </div>
      </Card>

      <Card title="Status">
        <div className="flex flex-col gap-3">
          {instance.status.map((s) => (
            <div key={s.label} className="flex items-center justify-between gap-2">
              <span className="font-sans text-xs text-content-secondary">{s.label}</span>
              <Badge tone={s.tone} dot>
                {s.value}
              </Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
