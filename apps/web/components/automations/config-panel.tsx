"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import {
  KIND_META,
  nodeDef,
  isStepComplete,
  stepSentence,
  PALETTE,
  FIELDS,
  OPERATORS,
  TOKENS,
  RECORD_TYPES,
  RELATIVE_DATE_FIELDS,
  type FlowStep,
  type FieldDef,
  type FilterClause,
} from "./catalogue";

const TRIGGERS = PALETTE.find((g) => g.group === "Auslöser")!.items;
const ACTIONS = PALETTE.find((g) => g.group === "Aktionen")!.items;

const RECIPIENTS = [
  { value: "contact", label: "Der Kontakt am Deal" },
  { value: "owner", label: "Der Deal-Inhaber" },
  { value: "custom", label: "Bestimmte Adresse …" },
];
const ASSIGNEES = [
  { value: "owner", label: "Der Deal-Inhaber" },
  { value: "roundrobin", label: "Reihum im Vertriebsteam" },
  { value: "person", label: "Bestimmte Person …" },
];
const DUE = [
  { value: "0", label: "Am selben Tag" },
  { value: "1", label: "Nach 1 Tag" },
  { value: "3", label: "Nach 3 Tagen" },
  { value: "7", label: "Nach 7 Tagen" },
];
const STAGES = ["Lead", "Qualifiziert", "Angebot", "Verhandlung"];
const UNITS = ["Minuten", "Stunden", "Tage", "Wochen"];
const OFFSET_UNITS = ["Tage", "Wochen"];
const OFFSET_DIRS = [
  { value: "vor", label: "davor" },
  { value: "nach", label: "danach" },
];

type Cfg = Record<string, unknown>;

// ── Plain-language data token pills (no {{ }} syntax) ────────────────────────
function TokenPill({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span className="m-0.5 inline-flex h-[22px] items-center gap-1.5 rounded-full bg-surface-brand-subtle pl-2.5 text-xs font-medium text-content-brand" style={{ paddingRight: onRemove ? 4 : 10 }}>
      <Icon name="braces" size={11} />
      {label}
      {onRemove ? (
        <button type="button" aria-label="Entfernen" onClick={onRemove} className="grid h-[15px] w-[15px] place-items-center rounded-full" style={{ cursor: "pointer" }}>
          <Icon name="x" size={10} />
        </button>
      ) : null}
    </span>
  );
}

function TokenChooser({ onPick }: { onPick: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const groups = TOKENS.map((g) => ({ ...g, items: g.items.filter((i) => i.toLowerCase().includes(q.toLowerCase())) })).filter((g) => g.items.length);
  return (
    <div className="relative">
      <Button size="sm" variant="secondary" iconLeft="braces" onClick={() => setOpen((o) => !o)}>Daten einfügen</Button>
      {open ? (
        <div className="absolute right-0 top-[calc(100%+6px)] z-30 max-h-[300px] w-[288px] overflow-y-auto rounded-lg border border-edge bg-surface-card p-3 shadow-lg">
          <p className="mb-2 text-2xs leading-normal text-content-muted">
            Wählen Sie einen Wert aus einem früheren Schritt. Kundeo setzt ihn beim Lauf automatisch ein.
          </p>
          <Input size="sm" iconLeft="search" placeholder="Wert suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="mt-3 flex flex-col gap-3">
            {groups.map((g) => (
              <div key={g.group}>
                <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-content-subtle">{g.group}</p>
                <div className="flex flex-wrap gap-1">
                  {g.items.map((i) => (
                    <button key={i} type="button" onClick={() => { onPick(i); setOpen(false); }} className="border-0 bg-transparent p-0" style={{ cursor: "pointer" }}>
                      <TokenPill label={i} />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** One guided condition row: entity → field → operator → value. No expressions. */
function ConditionRow({
  row,
  index,
  onChange,
  onRemove,
}: {
  row: FilterClause;
  index: number;
  onChange: (next: FilterClause) => void;
  onRemove?: () => void;
}) {
  const entity = row.entity ?? "Deal";
  const fields = FIELDS[entity] ?? [];
  const field: FieldDef | undefined = fields.find((f) => f.value === row.field) ?? fields[0];
  const ops = OPERATORS[field?.kind ?? "text"] ?? [];

  return (
    <div className="flex flex-col gap-2 rounded-md border border-edge bg-surface-page p-3">
      <div className="flex items-center gap-2">
        <span className="text-2xs font-semibold uppercase tracking-wide text-content-subtle">
          {index === 0 ? "Nur weiter, wenn" : "und"}
        </span>
        {onRemove ? <IconButton icon="x" label="Bedingung entfernen" size="sm" className="ml-auto" onClick={onRemove} /> : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select
          size="sm"
          value={entity}
          onChange={(e) => {
            const ent = e.target.value;
            const f0 = FIELDS[ent]![0]!;
            onChange({ entity: ent, field: f0.value, op: OPERATORS[f0.kind][0]!, value: "", unit: f0.kind === "money" ? "EUR" : undefined });
          }}
          options={Object.keys(FIELDS)}
        />
        <Select
          size="sm"
          value={field?.value}
          onChange={(e) => {
            const fd = fields.find((f) => f.value === e.target.value)!;
            onChange({ ...row, field: fd.value, op: OPERATORS[fd.kind][0]!, value: "", unit: fd.kind === "money" ? "EUR" : undefined });
          }}
          options={fields.map((f) => ({ value: f.value, label: f.label }))}
        />
        <Select size="sm" value={row.op} onChange={(e) => onChange({ ...row, op: e.target.value })} options={ops} />
        {field?.kind === "enum" ? (
          <Select size="sm" value={row.value ?? ""} onChange={(e) => onChange({ ...row, value: e.target.value })} placeholder="Wert" options={field.options ?? []} />
        ) : field?.kind === "bool" ? (
          <Select size="sm" value={row.value ?? ""} onChange={(e) => onChange({ ...row, value: e.target.value })} options={["ja", "nein"]} />
        ) : (
          <Input
            size="sm"
            mono={field?.kind === "money"}
            align={field?.kind === "money" ? "right" : "left"}
            suffix={field?.kind === "money" ? "EUR" : undefined}
            value={row.value ?? ""}
            onChange={(e) => onChange({ ...row, value: e.target.value })}
            placeholder="Wert"
          />
        )}
      </div>
    </div>
  );
}

/** Free-text field that can carry plain-language data pills. */
function TokenField({
  label,
  text,
  tokens,
  multiline = false,
  onText,
  onTokens,
}: {
  label: string;
  text: string;
  tokens: string[];
  multiline?: boolean;
  onText: (v: string) => void;
  onTokens: (v: string[]) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-xs font-medium text-content-secondary">{label}</span>
        <div className="ml-auto">
          <TokenChooser onPick={(t) => onTokens([...tokens, t])} />
        </div>
      </div>
      {multiline ? (
        <Textarea rows={3} value={text} onChange={(e) => onText(e.target.value)} />
      ) : (
        <Input value={text} onChange={(e) => onText(e.target.value)} />
      )}
      {tokens.length ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {tokens.map((t, i) => (
            <TokenPill key={`${t}-${i}`} label={t} onRemove={() => onTokens(tokens.filter((_, j) => j !== i))} />
          ))}
        </div>
      ) : null}
      <p className="mt-1.5 text-2xs text-content-muted">Die Pillen werden beim Lauf durch die echten Werte ersetzt.</p>
    </div>
  );
}

function ConsentBlock({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex gap-3 rounded-md p-3" style={{ background: "var(--surface-success-subtle)" }}>
      <Icon name="shield-check" size={16} color="var(--text-success)" />
      <div>
        <p className="text-xs font-medium text-content">Einwilligung wird geprüft</p>
        <p className="mb-2 mt-0.5 text-2xs leading-normal text-content-secondary">
          Kontakte ohne dokumentierte Einwilligung werden übersprungen und im Protokoll vermerkt.
        </p>
        <Switch label="Prüfung aktiv" checked={checked} onChange={onChange} />
      </div>
    </div>
  );
}

/**
 * The relative trigger's timing picker: a date field plus "N Tage/Wochen
 * davor/danach". No expressions — the three plain controls fully define when it
 * fires. We also store the derived `offsetDays` (negative = before) that the
 * engine reads directly.
 */
function RelativeTiming({
  field,
  amount,
  unit,
  dir,
  onChange,
}: {
  field: string;
  amount: string;
  unit: string;
  dir: string;
  onChange: (patch: Cfg) => void;
}) {
  const commit = (next: { field?: string; amount?: string; unit?: string; dir?: string }) => {
    const f = next.field ?? field;
    const a = next.amount ?? amount;
    const u = next.unit ?? unit;
    const d = next.dir ?? dir;
    const n = Math.abs(Math.round(Number(a) || 0));
    const days = n * (u === "Wochen" ? 7 : 1);
    onChange({ field: f, offsetAmount: a, offsetUnit: u, offsetDir: d, offsetDays: d === "vor" ? -days : days });
  };
  return (
    <div className="flex flex-col gap-3 rounded-md border border-edge bg-surface-page p-3">
      <Field label="Datum" required hint="Nur echte Datumsfelder">
        <Select
          placeholder="Datum wählen"
          value={field}
          onChange={(e) => commit({ field: e.target.value })}
          options={RELATIVE_DATE_FIELDS}
        />
      </Field>
      <Field label="Zeitpunkt">
        <div className="grid grid-cols-[90px_1fr_1fr] gap-2">
          <Input size="sm" mono align="right" value={amount} onChange={(e) => commit({ amount: e.target.value })} />
          <Select size="sm" value={unit} onChange={(e) => commit({ unit: e.target.value })} options={OFFSET_UNITS} />
          <Select size="sm" value={dir} onChange={(e) => commit({ dir: e.target.value })} options={OFFSET_DIRS} />
        </div>
      </Field>
      <p className="text-2xs leading-normal text-content-muted">
        Läuft täglich ab 08:00 Uhr und prüft, welche Deals den gewählten Abstand zum Datum erreichen.
      </p>
    </div>
  );
}

export interface EmailTemplateOption {
  id: string;
  name: string;
}

export function ConfigPanel({
  step,
  onChange,
  onClose,
  onDelete,
  emailTemplates = [],
}: {
  step: FlowStep | null;
  onChange: (next: FlowStep) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
  /** Org email templates the "E-Mail senden" action can select. */
  emailTemplates?: EmailTemplateOption[];
}) {
  if (!step) {
    return (
      <div className="p-5">
        <EmptyState icon="mouse-pointer-click" title="Kein Schritt ausgewählt" description="Klicken Sie links auf einen Schritt, um ihn hier zu bearbeiten." compact />
      </div>
    );
  }

  const meta = KIND_META[step.kind] ?? KIND_META.ACTION;
  const c = (step.config ?? {}) as Cfg;
  const invalid = !isStepComplete(step.type, step.config);
  const set = (patch: Cfg) => onChange({ ...step, config: { ...c, ...patch } });
  const setType = (type: string) => onChange({ ...step, type });
  const s = (k: string, dflt = "") => (c[k] == null ? dflt : String(c[k]));
  const arr = (k: string) => (Array.isArray(c[k]) ? (c[k] as string[]) : []);

  let body: ReactNode = null;

  if (step.kind === "TRIGGER") {
    const filters = (Array.isArray(c.filters) ? (c.filters as FilterClause[]) : []) as FilterClause[];
    const setFilters = (f: FilterClause[]) => set({ filters: f });
    body = (
      <>
        <Field label="Auslöser" hint="Womit startet die Automation?">
          <Select value={step.type} onChange={(e) => setType(e.target.value)} options={TRIGGERS.map((i) => ({ value: i.type, label: i.name }))} />
        </Field>
        {step.type === "relative" ? (
          <RelativeTiming
            field={s("field")}
            amount={s("offsetAmount", "7")}
            unit={s("offsetUnit", "Tage")}
            dir={s("offsetDir", "vor")}
            onChange={set}
          />
        ) : null}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <p className="text-xs font-semibold text-content">Einschränkung</p>
            <Tooltip label="Läuft nur, wenn alles zutrifft"><Icon name="info" size={13} color="var(--text-subtle)" /></Tooltip>
            <Button size="sm" variant="ghost" iconLeft="plus" className="ml-auto" onClick={() => setFilters([...filters, { entity: "Deal", field: "stage", op: "ist", value: "Angebot" }])}>
              Bedingung
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {filters.map((row, i) => (
              <ConditionRow key={i} index={i} row={row} onChange={(next) => setFilters(filters.map((r, j) => (j === i ? next : r)))} onRemove={() => setFilters(filters.filter((_, j) => j !== i))} />
            ))}
            {!filters.length ? <p className="text-xs text-content-muted">Ohne Einschränkung läuft die Automation bei jedem Treffer.</p> : null}
          </div>
        </div>
      </>
    );
  } else if (step.kind === "BRANCH") {
    const cond = (c.condition as FilterClause | undefined) ?? { entity: "Deal", field: "amount", op: "ist größer als", value: "" };
    body = (
      <>
        <div className="flex gap-3 rounded-md p-3" style={{ background: "var(--surface-brand-subtle)" }}>
          <Icon name="git-branch" size={16} color="var(--text-brand)" />
          <p className="text-xs leading-normal text-content">
            Trifft die Bedingung zu, geht es im Pfad <strong>Ja</strong> weiter, sonst im Pfad <strong>Nein</strong>.
          </p>
        </div>
        <ConditionRow index={0} row={cond} onChange={(next) => set({ condition: next })} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Pfad-Beschriftung (Ja)"><Input size="sm" value={s("labelYes", "Ja")} onChange={(e) => set({ labelYes: e.target.value })} /></Field>
          <Field label="Pfad-Beschriftung (Nein)"><Input size="sm" value={s("labelNo", "Nein")} onChange={(e) => set({ labelNo: e.target.value })} /></Field>
        </div>
      </>
    );
  } else if (step.kind === "FILTER") {
    const cond = { entity: c.entity as string, field: c.field as string, op: c.op as string, value: c.value as string } as FilterClause;
    body = <ConditionRow index={0} row={cond} onChange={(next) => set({ ...next })} />;
  } else if (step.kind === "DELAY") {
    body =
      step.type === "wait.until" ? (
        <Field label="Warten bis" hint="Der Ablauf pausiert bis zu diesem Datum.">
          <Input type="date" value={s("date")} onChange={(e) => set({ date: e.target.value })} />
        </Field>
      ) : (
        <>
          <Field label="Wie lange soll gewartet werden?">
            <div className="grid grid-cols-[100px_1fr] gap-2">
              <Input mono align="right" value={s("amount", "3")} onChange={(e) => set({ amount: e.target.value })} />
              <Select value={s("unit", "Tage")} onChange={(e) => set({ unit: e.target.value })} options={UNITS} />
            </div>
          </Field>
          <Switch label="Nur an Werktagen weiterlaufen" hint="Wochenenden und Feiertage werden übersprungen" checked={c.businessDays === true} onChange={(v) => set({ businessDays: v })} />
        </>
      );
  } else if (step.type === "email.send") {
    body = (
      <>
        {emailTemplates.length ? (
          <Field label="E-Mail-Vorlage" required hint="Betreff und Inhalt stammen aus der Vorlage.">
            <Select
              placeholder="Vorlage wählen"
              value={s("templateId")}
              onChange={(e) => {
                const tpl = emailTemplates.find((t) => t.id === e.target.value);
                set({ templateId: e.target.value, template: tpl?.name ?? "" });
              }}
              options={emailTemplates.map((t) => ({ value: t.id, label: t.name }))}
            />
          </Field>
        ) : (
          <div className="flex flex-col gap-2 rounded-md p-3" style={{ background: "var(--surface-warning-subtle)", border: "1px solid var(--amber-500)" }}>
            <p className="text-xs font-medium text-content">Noch keine E-Mail-Vorlage</p>
            <p className="text-2xs leading-normal text-content-secondary">Legen Sie in den Einstellungen eine Vorlage an.</p>
            <Link href="/settings" className="text-2xs font-medium text-content-brand hover:underline">Einstellungen öffnen</Link>
          </div>
        )}
        <Field label="Empfänger">
          <Select value={s("recipient", "contact")} onChange={(e) => set({ recipient: e.target.value })} options={RECIPIENTS} />
        </Field>
        <ConsentBlock checked={c.consent !== false} onChange={(v) => set({ consent: v })} />
      </>
    );
  } else if (step.type === "task.create") {
    body = (
      <>
        <Field label="Aufgabentitel" required>
          <Input value={s("title")} onChange={(e) => set({ title: e.target.value })} placeholder="z. B. Onboarding starten" />
        </Field>
        <Field label="Zuständig"><Select value={s("assignee", "owner")} onChange={(e) => set({ assignee: e.target.value })} options={ASSIGNEES} /></Field>
        <Field label="Fällig"><Select value={s("dueDays", "3")} onChange={(e) => set({ dueDays: e.target.value })} options={DUE} /></Field>
        <TokenField label="Beschreibung" multiline text={s("description")} tokens={arr("descriptionTokens")} onText={(v) => set({ description: v })} onTokens={(t) => set({ descriptionTokens: t })} />
      </>
    );
  } else {
    // Generic action editor — swap the action, then its one main input.
    body = (
      <>
        <Field label="Was soll passieren?" hint="Auswahl in Klartext, keine Formeln">
          <Select value={step.type} onChange={(e) => setType(e.target.value)} options={ACTIONS.map((i) => ({ value: i.type, label: i.name }))} />
        </Field>
        {step.type === "deal.move" ? (
          <Field label="Zielphase" required><Select placeholder="Phase wählen" value={s("stage")} onChange={(e) => set({ stage: e.target.value })} options={STAGES} /></Field>
        ) : step.type === "tag.add" ? (
          <Field label="Tag" required><Input value={s("tag")} onChange={(e) => set({ tag: e.target.value })} placeholder="z. B. Interessent" /></Field>
        ) : step.type === "field.set" ? (
          <>
            <Field label="Feld" required><Select placeholder="Feld wählen" value={s("field")} onChange={(e) => set({ field: e.target.value })} options={(FIELDS.Deal ?? []).map((f) => ({ value: f.value, label: f.label }))} /></Field>
            <Field label="Wert" required><Input value={s("value")} onChange={(e) => set({ value: e.target.value })} /></Field>
          </>
        ) : step.type === "assign" ? (
          <Field label="Zuweisen an" required><Select placeholder="Wählen" value={s("assignee")} onChange={(e) => set({ assignee: e.target.value })} options={ASSIGNEES} /></Field>
        ) : step.type === "webhook" ? (
          <>
            <div className="flex gap-3 rounded-md p-3" style={{ background: "var(--surface-warning-subtle)", border: "1px solid var(--amber-500)" }}>
              <Icon name="triangle-alert" size={16} color="var(--amber-600)" />
              <p className="text-xs leading-normal text-content">
                Ein Webhook sendet Daten an einen externen Dienst. Bitte bestätigen Sie den Empfänger vor dem ersten Einsatz.
              </p>
            </div>
            <Field label="Webhook-URL" required hint="Profi-Funktion"><Input mono value={s("url")} onChange={(e) => set({ url: e.target.value })} placeholder="https://…" /></Field>
            <Switch label="Empfänger geprüft und bestätigt" checked={c.confirmed === true} onChange={(v) => set({ confirmed: v })} />
          </>
        ) : step.type === "subflow" ? (
          <Field label="Andere Automation" required hint="Name der Automation, die gestartet wird">
            <Input value={s("workflow")} onChange={(e) => set({ workflow: e.target.value })} placeholder="z. B. Onboarding starten" />
          </Field>
        ) : step.type === "record.create" ? (
          <>
            <Field label="Datensatztyp" required>
              <Select placeholder="Typ wählen" value={s("recordType")} onChange={(e) => set({ recordType: e.target.value })} options={RECORD_TYPES} />
            </Field>
            {s("recordType") === "task" ? (
              <>
                <Field label="Aufgabentitel" required><Input value={s("title")} onChange={(e) => set({ title: e.target.value })} placeholder="z. B. Angebot nachfassen" /></Field>
                <Field label="Fällig"><Select value={s("dueDays", "3")} onChange={(e) => set({ dueDays: e.target.value })} options={DUE} /></Field>
              </>
            ) : s("recordType") === "company" ? (
              <Field label="Firmenname" required><Input value={s("name")} onChange={(e) => set({ name: e.target.value })} placeholder="z. B. Muster GmbH" /></Field>
            ) : s("recordType") === "contact" ? (
              <>
                <Field label="Nachname" required><Input value={s("lastName")} onChange={(e) => set({ lastName: e.target.value })} placeholder="z. B. Müller" /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Vorname"><Input value={s("firstName")} onChange={(e) => set({ firstName: e.target.value })} /></Field>
                  <Field label="E-Mail"><Input value={s("email")} onChange={(e) => set({ email: e.target.value })} placeholder="name@firma.de" /></Field>
                </div>
                <p className="text-2xs text-content-muted">Der Kontakt wird der Firma des auslösenden Datensatzes zugeordnet, sofern vorhanden.</p>
              </>
            ) : s("recordType") === "deal" ? (
              <>
                <Field label="Deal-Titel" required><Input value={s("title")} onChange={(e) => set({ title: e.target.value })} placeholder="z. B. Verlängerung 2027" /></Field>
                <Field label="Betrag" hint="Optional"><Input mono align="right" suffix="EUR" value={s("amount")} onChange={(e) => set({ amount: e.target.value })} placeholder="0" /></Field>
                <p className="text-2xs text-content-muted">Der Deal startet in der ersten Phase der Standard-Pipeline und übernimmt Firma und Kontakt des auslösenden Datensatzes.</p>
              </>
            ) : null}
          </>
        ) : (
          <TokenField label="Text" multiline text={s("text")} tokens={arr("textTokens")} onText={(v) => set({ text: v })} onTokens={(t) => set({ textTokens: t })} />
        )}
      </>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-start gap-3 border-b border-edge-subtle p-4">
        <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-md" style={{ background: meta.bg, color: meta.color }}>
          <Icon name={nodeDef(step.type).icon} size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-2xs font-semibold uppercase tracking-wide text-content-subtle">{meta.label}</p>
          <p className="mt-px text-sm font-semibold leading-snug text-content">{stepSentence(step.type, step.config)}</p>
        </div>
        <IconButton icon="x" label="Panel schließen" size="sm" onClick={onClose} />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
        {invalid ? (
          <div className="flex gap-3 rounded-md p-3" style={{ background: "var(--surface-warning-subtle)", border: "1px solid var(--amber-500)" }}>
            <Icon name="triangle-alert" size={16} color="var(--amber-600)" />
            <p className="text-xs leading-normal text-content">
              Diesem Schritt fehlen noch Angaben. Solange etwas fehlt, lässt sich die Automation nicht einschalten.
            </p>
          </div>
        ) : null}

        {body}

        <div className="border-t border-edge-subtle pt-2">
          <Button size="sm" variant="ghost" iconLeft="trash-2" disabled={step.kind === "TRIGGER"} onClick={() => onDelete(step.id)}>
            Schritt entfernen
          </Button>
        </div>
      </div>
    </div>
  );
}
