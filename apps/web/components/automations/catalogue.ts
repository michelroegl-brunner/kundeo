/**
 * The automation node catalogue — the single source of truth for the builder
 * palette, the plain-German sentence each node reads as, and the icon it uses.
 * Mirrors the design kit's data.js. Pure data + helpers (no "use client"): safe
 * to import from both server components and client components.
 *
 * Rule of the feature: a user never sees code, JSON or `{{ }}` syntax. Every
 * node is a whole German sentence; every reference to earlier data is a plain
 * token ("der Deal-Betrag"). This module keeps that promise in one place.
 */

export type StepKind = "TRIGGER" | "ACTION" | "DELAY" | "BRANCH" | "FILTER";

export interface NodeDef {
  type: string;
  kind: StepKind;
  /** Lucide icon name (registered in components/ui/icon.tsx). */
  icon: string;
  /** Short palette label. */
  name: string;
  /** Default plain-German sentence shown on the step card. */
  sentence: string;
  /** Email-sending actions — carry the consent-checked reassurance. */
  consent?: boolean;
  /** Power-user actions (webhook) — flagged "Profi" and confirmed before use. */
  advanced?: boolean;
  /** FreeFinance actions — shown only when the integration is connected. */
  freefinance?: boolean;
}

export interface PaletteGroup {
  group: string;
  hint: string;
  items: NodeDef[];
}

export const PALETTE: PaletteGroup[] = [
  {
    group: "Auslöser",
    hint: "Startet die Automation",
    items: [
      { type: "deal.won", kind: "TRIGGER", icon: "trophy", name: "Deal gewonnen", sentence: "Wenn ein Deal auf „Gewonnen“ gesetzt wird" },
      { type: "deal.created", kind: "TRIGGER", icon: "plus-circle", name: "Deal angelegt", sentence: "Wenn ein Deal angelegt wird" },
      { type: "deal.stage", kind: "TRIGGER", icon: "kanban", name: "Phase geändert", sentence: "Wenn ein Deal die Phase wechselt" },
      { type: "deal.lost", kind: "TRIGGER", icon: "circle-x", name: "Deal verloren", sentence: "Wenn ein Deal auf „Verloren“ gesetzt wird" },
      { type: "contact.created", kind: "TRIGGER", icon: "user-plus", name: "Kontakt angelegt", sentence: "Wenn ein Kontakt angelegt wird" },
      { type: "contact.updated", kind: "TRIGGER", icon: "pencil", name: "Kontakt geändert", sentence: "Wenn ein Kontakt geändert wird" },
      { type: "contact.tagged", kind: "TRIGGER", icon: "tag", name: "Kontakt getaggt", sentence: "Wenn ein Kontakt ein Tag erhält" },
      { type: "company.created", kind: "TRIGGER", icon: "building-2", name: "Firma angelegt", sentence: "Wenn eine Firma angelegt wird" },
      { type: "company.updated", kind: "TRIGGER", icon: "building-2", name: "Firma geändert", sentence: "Wenn eine Firma geändert wird" },
      { type: "task.created", kind: "TRIGGER", icon: "list-checks", name: "Aufgabe angelegt", sentence: "Wenn eine Aufgabe angelegt wird" },
      { type: "task.completed", kind: "TRIGGER", icon: "circle-check", name: "Aufgabe erledigt", sentence: "Wenn eine Aufgabe erledigt wird" },
      { type: "task.overdue", kind: "TRIGGER", icon: "clock-alert", name: "Aufgabe überfällig", sentence: "Wenn eine Aufgabe überfällig wird" },
      { type: "invoice.dunned", kind: "TRIGGER", icon: "bell-ring", name: "Mahnung versendet", sentence: "Wenn eine Mahnung an einen Kunden versendet wird" },
      { type: "schedule", kind: "TRIGGER", icon: "calendar-clock", name: "Zeitplan", sentence: "Nach einem festen Zeitplan" },
      { type: "relative", kind: "TRIGGER", icon: "calendar-days", name: "Vor einem Datum", sentence: "Eine bestimmte Zeit vor einem Datum" },
      { type: "inbound", kind: "TRIGGER", icon: "mail-open", name: "E-Mail-Eingang", sentence: "Wenn eine E-Mail im Postfach eingeht" },
    ],
  },
  {
    group: "Bedingungen",
    hint: "Prüft, ob es weitergeht",
    items: [
      { type: "branch", kind: "BRANCH", icon: "git-branch", name: "Verzweigung", sentence: "Wenn … dann … sonst …" },
      { type: "filter", kind: "FILTER", icon: "filter", name: "Nur weiter wenn", sentence: "Nur weiter, wenn eine Bedingung zutrifft" },
    ],
  },
  {
    group: "Aktionen",
    hint: "Was Kundeo tun soll",
    items: [
      { type: "task.create", kind: "ACTION", icon: "list-checks", name: "Aufgabe erstellen", sentence: "Aufgabe für den Deal-Inhaber erstellen" },
      { type: "email.send", kind: "ACTION", icon: "mail", name: "E-Mail senden", sentence: "E-Mail aus einer Vorlage senden", consent: true },
      { type: "deal.move", kind: "ACTION", icon: "move-right", name: "Deal verschieben", sentence: "Deal in eine andere Phase verschieben" },
      { type: "field.set", kind: "ACTION", icon: "pencil", name: "Feld setzen", sentence: "Ein Feld am Datensatz setzen" },
      { type: "tag.add", kind: "ACTION", icon: "tag", name: "Tag hinzufügen", sentence: "Ein Tag am Kontakt hinzufügen" },
      { type: "record.create", kind: "ACTION", icon: "file-plus", name: "Datensatz anlegen", sentence: "Einen neuen Datensatz anlegen" },
      { type: "note.add", kind: "ACTION", icon: "sticky-note", name: "Notiz anfügen", sentence: "Notiz am Datensatz hinzufügen" },
      { type: "notify", kind: "ACTION", icon: "bell", name: "Benachrichtigen", sentence: "Team intern benachrichtigen" },
      { type: "assign", kind: "ACTION", icon: "users", name: "Zuweisen", sentence: "Datensatz einer Person zuweisen" },
      { type: "webhook", kind: "ACTION", icon: "webhook", name: "Webhook aufrufen", sentence: "Einen Webhook aufrufen", advanced: true },
      { type: "subflow", kind: "ACTION", icon: "workflow", name: "Automation starten", sentence: "Eine andere Automation starten" },
      { type: "freefinance.customer.sync", kind: "ACTION", icon: "refresh-cw", name: "Kunde synchronisieren", sentence: "Firma als Kunde in FreeFinance anlegen oder aktualisieren", freefinance: true },
      { type: "freefinance.invoice.create", kind: "ACTION", icon: "receipt", name: "Rechnung erstellen", sentence: "Rechnung in FreeFinance aus dem Deal erzeugen", freefinance: true },
    ],
  },
  {
    group: "Verzögerungen",
    hint: "Wartet, bevor es weitergeht",
    items: [
      { type: "wait.duration", kind: "DELAY", icon: "hourglass", name: "Warten", sentence: "Eine feste Zeit warten" },
      { type: "wait.until", kind: "DELAY", icon: "calendar-check", name: "Warten bis", sentence: "Warten bis zu einem Datum" },
    ],
  },
];

/** type → node definition, flattened from the palette. */
export const NODE_BY_TYPE: Record<string, NodeDef> = Object.fromEntries(
  PALETTE.flatMap((g) => g.items).map((n) => [n.type, n]),
);

/** A safe fallback so an unknown persisted type never renders blank. */
export function nodeDef(type: string): NodeDef {
  return NODE_BY_TYPE[type] ?? { type, kind: "ACTION", icon: "workflow", name: type, sentence: type };
}

/**
 * The palette a user may pick from. FreeFinance actions appear only when the
 * integration is connected — without credentials the feature stays invisible,
 * matching the nav gating. Persisted steps still render via `nodeDef`, so an
 * already-saved FreeFinance step is never hidden retroactively.
 */
export function visiblePalette(freeFinanceConnected: boolean): PaletteGroup[] {
  if (freeFinanceConnected) return PALETTE;
  return PALETTE.map((g) => ({ ...g, items: g.items.filter((i) => !i.freefinance) }));
}

/** German field labels for the guided pickers / filter summaries. */
const FIELD_LABEL: Record<string, string> = {
  amount: "Betrag",
  stage: "Phase",
  currency: "Währung",
  owner: "Inhaber",
  title: "Titel",
  country: "Land",
  industry: "Branche",
  vatId: "USt-IdNr.",
  salutation: "Anrede",
  position: "Position",
  consent: "Einwilligung",
};

export function fieldLabel(field: string): string {
  return FIELD_LABEL[field] ?? field;
}

// ── Guided-picker catalogue (entity → field → operator → value) ─────────────
export type FieldKind = "money" | "text" | "enum" | "user" | "bool";

export interface FieldDef {
  value: string;
  label: string;
  kind: FieldKind;
  options?: string[];
}

export const FIELDS: Record<string, FieldDef[]> = {
  Deal: [
    { value: "amount", label: "Betrag", kind: "money" },
    { value: "stage", label: "Phase", kind: "enum", options: ["Lead", "Qualifiziert", "Angebot", "Verhandlung"] },
    { value: "currency", label: "Währung", kind: "enum", options: ["EUR", "CHF"] },
    { value: "owner", label: "Inhaber", kind: "user" },
    { value: "title", label: "Titel", kind: "text" },
  ],
  Firma: [
    { value: "country", label: "Land", kind: "enum", options: ["Deutschland", "Österreich", "Schweiz"] },
    { value: "industry", label: "Branche", kind: "text" },
    { value: "vatId", label: "USt-IdNr.", kind: "text" },
  ],
  Kontakt: [
    { value: "salutation", label: "Anrede", kind: "enum", options: ["Herr", "Frau", "Divers"] },
    { value: "position", label: "Position", kind: "text" },
    { value: "consent", label: "Einwilligung", kind: "bool" },
  ],
  Rechnung: [
    { value: "amount", label: "Betrag", kind: "money" },
    { value: "dunningLevel", label: "Mahnstufe", kind: "text" },
    { value: "paymentStatus", label: "Zahlstatus", kind: "enum", options: ["OPEN", "PARTIAL", "PAID"] },
    { value: "number", label: "Nummer", kind: "text" },
  ],
};

/** Record kinds the "Datensatz anlegen" action can create, in plain German. */
export const RECORD_TYPES: { value: string; label: string }[] = [
  { value: "task", label: "Aufgabe" },
  { value: "contact", label: "Kontakt" },
  { value: "company", label: "Firma" },
  { value: "deal", label: "Deal" },
];

/**
 * Date fields a relative trigger ("N Tage vor einem Datum") can fire against.
 * Only real Deal date columns — the engine maps these back to the schema and
 * skips anything it cannot resolve.
 */
export const RELATIVE_DATE_FIELDS: { value: string; label: string }[] = [
  { value: "abschluss", label: "Abschlussdatum" },
  { value: "verlaengerung", label: "Verlängerungsdatum" },
];

export const OPERATORS: Record<FieldKind, string[]> = {
  money: ["ist größer als", "ist kleiner als", "ist genau", "liegt zwischen"],
  text: ["ist", "ist nicht", "enthält", "ist leer"],
  enum: ["ist", "ist nicht", "ist eine von"],
  user: ["ist", "ist nicht", "ist leer"],
  bool: ["liegt vor", "liegt nicht vor"],
};

/** Plain-language data tokens for the "Daten einfügen" chooser. */
export const TOKENS: { group: string; items: string[] }[] = [
  { group: "Aus dem Auslöser — Deal", items: ["der Deal-Titel", "der Deal-Betrag", "die Deal-Phase", "der Deal-Inhaber", "das Abschlussdatum"] },
  { group: "Aus dem Auslöser — Firma", items: ["der Firmenname", "die Stadt", "die USt-IdNr."] },
  { group: "Aus dem Auslöser — Kontakt", items: ["die Anrede", "der Nachname", "die E-Mail-Adresse"] },
  { group: "Allgemein", items: ["heutiges Datum", "Name der Organisation", "angemeldete Person"] },
];

export interface FilterClause {
  entity?: string;
  field: string;
  op: string;
  value?: string;
  unit?: string;
}

/** One filter clause → "Betrag ist größer als 10.000 EUR". */
export function filterText(f: FilterClause): string {
  return [fieldLabel(f.field), f.op, f.value, f.unit].filter(Boolean).join(" ");
}

/**
 * The plain-German one-liner shown for a workflow's trigger on the list: the
 * trigger's base sentence, plus any filter clauses as "· nur wenn …".
 */
export function triggerSummary(type: string, config: unknown): string {
  const base = nodeDef(type).sentence;
  const filters = (config as { filters?: FilterClause[] } | null)?.filters;
  if (Array.isArray(filters) && filters.length) {
    return `${base} · nur wenn ${filters.map(filterText).join(" und ")}`;
  }
  return base;
}

/** Per-kind label + tint tokens for step cards, the palette and the panel. */
export const KIND_META: Record<StepKind, { label: string; color: string; bg: string }> = {
  TRIGGER: { label: "Auslöser", color: "var(--kundeo-amber)", bg: "var(--surface-warning-subtle)" },
  ACTION: { label: "Aktion", color: "var(--kundeo-indigo)", bg: "var(--surface-brand-subtle)" },
  DELAY: { label: "Verzögerung", color: "var(--neutral-500)", bg: "var(--surface-sunken)" },
  BRANCH: { label: "Verzweigung", color: "var(--kundeo-green)", bg: "var(--surface-success-subtle)" },
  FILTER: { label: "Bedingung", color: "var(--kundeo-green)", bg: "var(--surface-success-subtle)" },
};

/** Config keys a step must have set before the workflow can be published. */
const REQUIRED_CONFIG: Record<string, string[]> = {
  "task.create": ["title"],
  "email.send": ["templateId"],
  "note.add": ["text"],
  notify: ["text"],
  "wait.duration": ["amount"],
  "deal.move": ["stage"],
  "field.set": ["field", "value"],
  "record.create": ["recordType"],
  "tag.add": ["tag"],
  assign: ["assignee"],
  webhook: ["url"],
  subflow: ["workflow"],
  "freefinance.customer.sync": ["record"],
  "freefinance.invoice.create": ["lineSource", "account", "vatRate"],
  relative: ["field"],
  branch: ["condition"],
  filter: ["field"],
};

type Config = Record<string, unknown>;

function asConfig(config: unknown): Config {
  return config && typeof config === "object" ? (config as Config) : {};
}

function present(v: unknown): boolean {
  return v != null && v !== "" && !(Array.isArray(v) && v.length === 0);
}

/** A step is complete once every required config key is filled. */
export function isStepComplete(type: string, config: unknown): boolean {
  const c = asConfig(config);
  // email.send now references a template by id; accept a legacy `template` name
  // so steps saved before the email-templates feature still count as complete.
  if (type === "email.send") return present(c.templateId) || present(c.template);
  const required = REQUIRED_CONFIG[type];
  if (!required) return true;
  return required.every((k) => present(c[k]));
}

/** The plain-German sentence a step card shows — derived from type + config. */
export function stepSentence(type: string, config: unknown): string {
  const base = nodeDef(type).sentence;
  const c = asConfig(config);
  const s = (k: string) => (present(c[k]) ? String(c[k]) : undefined);
  switch (type) {
    case "wait.duration":
      return `${s("amount") ?? "…"} ${s("unit") ?? "Tage"} warten`;
    case "task.create":
      return s("title") ? `Aufgabe erstellen: „${s("title")}“` : base;
    case "email.send":
      return s("template") ? `E-Mail „${s("template")}“ senden` : base;
    case "note.add":
      return s("text") ? `Notiz hinzufügen: „${s("text")}“` : base;
    case "notify":
      return s("text") ? `Team benachrichtigen: „${s("text")}“` : base;
    case "deal.move":
      return s("stage") ? `Deal in Phase „${s("stage")}“ verschieben` : base;
    case "tag.add":
      return s("tag") ? `Tag „${s("tag")}“ hinzufügen` : base;
    case "record.create": {
      const rt = RECORD_TYPES.find((r) => r.value === s("recordType"));
      return rt ? `${rt.label} anlegen` : base;
    }
    case "freefinance.customer.sync": {
      const rec = s("record");
      if (rec === "contact") return "Kontakt des Deals in FreeFinance synchronisieren";
      if (rec === "company") return "Firma des Deals in FreeFinance synchronisieren";
      return base;
    }
    case "freefinance.invoice.create": {
      const src = s("lineSource");
      const finalize = c.finalize === true ? " · sofort finalisieren" : "";
      if (src === "offer") return `Rechnung aus dem angenommenen Angebot erstellen${finalize}`;
      if (src === "deal") return `Rechnung aus dem Deal-Betrag erstellen${finalize}`;
      return base;
    }
    case "relative": {
      const df = RELATIVE_DATE_FIELDS.find((d) => d.value === s("field"));
      const days = Number(s("offsetDays"));
      if (!df || !Number.isFinite(days)) return base;
      const n = Math.abs(days);
      const when = days <= 0 ? "vor" : "nach";
      return `${n} ${n === 1 ? "Tag" : "Tage"} ${when} dem ${df.label}`;
    }
    case "branch": {
      const cond = c.condition as FilterClause | undefined;
      return cond && present(cond.field) ? `Wenn ${filterText(cond)}` : base;
    }
    case "filter":
      return present(c.field) ? `Nur weiter, wenn ${filterText(c as unknown as FilterClause)}` : base;
    default:
      return base;
  }
}

// ── Flat (DB) ↔ tree (builder) transforms ───────────────────────────────────
// The DB stores steps flat: parentStepId + branchPath + order. The builder
// works on a nested tree where a BRANCH step carries its `yes` / `no` lanes.

export interface FlowStep {
  id: string;
  kind: StepKind;
  type: string;
  config: Config;
  /** Present only on BRANCH steps. */
  yes?: FlowStep[];
  no?: FlowStep[];
}

export interface FlatStep {
  id: string;
  kind: StepKind;
  type: string;
  order: number;
  parentStepId: string | null;
  branchPath: "YES" | "NO" | null;
  config: unknown;
}

/** Build the nested builder tree from flat DB rows. */
export function buildTree(rows: FlatStep[]): FlowStep[] {
  const byOrder = (a: FlatStep, b: FlatStep) => a.order - b.order;
  const main = rows.filter((r) => r.parentStepId === null).sort(byOrder);
  const lane = (parentId: string, path: "YES" | "NO") =>
    rows
      .filter((r) => r.parentStepId === parentId && r.branchPath === path)
      .sort(byOrder)
      .map(toNode);
  function toNode(r: FlatStep): FlowStep {
    const node: FlowStep = { id: r.id, kind: r.kind, type: r.type, config: asConfig(r.config) };
    if (r.kind === "BRANCH") {
      node.yes = lane(r.id, "YES");
      node.no = lane(r.id, "NO");
    }
    return node;
  }
  return main.map(toNode);
}

/** Flatten the builder tree back to persistable rows (parents before children). */
export function flattenTree(tree: FlowStep[]): FlatStep[] {
  const out: FlatStep[] = [];
  tree.forEach((s, i) => {
    out.push({ id: s.id, kind: s.kind, type: s.type, order: i, parentStepId: null, branchPath: null, config: s.config });
  });
  for (const s of tree) {
    if (s.kind !== "BRANCH") continue;
    (["yes", "no"] as const).forEach((laneKey) => {
      const path = laneKey === "yes" ? "YES" : "NO";
      (s[laneKey] ?? []).forEach((c, i) => {
        out.push({ id: c.id, kind: c.kind, type: c.type, order: i, parentStepId: s.id, branchPath: path, config: c.config });
      });
    });
  }
  return out;
}
