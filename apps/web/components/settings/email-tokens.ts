/**
 * The data tokens an email template may embed, as plain German labels over a
 * stable `entity.field` path. The canonical value of a template's subject/body
 * is the text itself with literal `{{path}}` placeholders inline — pills are a
 * render layer, and the Visuell/Quelltext toggle round-trips losslessly. This
 * deliberately diverges from the automations panel's `TokenField`, which keeps a
 * parallel `tokens[]` array; templates are an admin surface where raw `{{ }}`
 * syntax is allowed, so one text field is the single source of truth.
 *
 * Pure data + helpers (no "use client"): safe to import from server and client.
 */

export interface EmailToken {
  /** Stable machine path, e.g. "contact.firstName". */
  path: string;
  /** Plain-German label shown on the pill and in the chooser. */
  label: string;
}

export interface EmailTokenGroup {
  group: string;
  items: EmailToken[];
}

export const EMAIL_TOKENS: EmailTokenGroup[] = [
  {
    group: "Kontakt",
    items: [
      { path: "contact.salutation", label: "die Anrede" },
      { path: "contact.firstName", label: "der Vorname" },
      { path: "contact.lastName", label: "der Nachname" },
      { path: "contact.email", label: "die E-Mail-Adresse" },
    ],
  },
  {
    group: "Firma",
    items: [
      { path: "company.name", label: "der Firmenname" },
      { path: "company.city", label: "die Stadt" },
      { path: "company.vatId", label: "die USt-IdNr." },
    ],
  },
  {
    group: "Deal",
    items: [
      { path: "deal.title", label: "der Deal-Titel" },
      { path: "deal.amount", label: "der Deal-Betrag" },
      { path: "deal.stage", label: "die Deal-Phase" },
      { path: "deal.owner", label: "der Deal-Inhaber" },
      { path: "deal.closeDate", label: "das Abschlussdatum" },
    ],
  },
  {
    group: "Allgemein",
    items: [
      { path: "today", label: "heutiges Datum" },
      { path: "org.name", label: "Name der Organisation" },
      { path: "user.name", label: "angemeldete Person" },
    ],
  },
];

/** path → label, flattened. */
const LABEL_BY_PATH: Record<string, string> = Object.fromEntries(
  EMAIL_TOKENS.flatMap((g) => g.items).map((t) => [t.path, t.label]),
);

/** The set of every known token path. */
export const KNOWN_TOKEN_PATHS: ReadonlySet<string> = new Set(Object.keys(LABEL_BY_PATH));

/** The plain-German label for a path, or the raw path when unknown. */
export function tokenLabel(path: string): string {
  return LABEL_BY_PATH[path] ?? path;
}

/** Matches a `{{ path }}` placeholder; the captured group is the path. */
const TOKEN_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

export type TokenNode = string | EmailToken;

/**
 * Split text into a list of literal strings and token nodes, in order. Used to
 * render the visual (pill) view. `parse → serialize` is a lossless round-trip.
 */
export function parseTokens(text: string): TokenNode[] {
  const nodes: TokenNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const start = m.index ?? 0;
    if (start > last) nodes.push(text.slice(last, start));
    nodes.push({ path: m[1]!, label: tokenLabel(m[1]!) });
    last = start + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** Rebuild the canonical text (literal `{{path}}`) from parsed nodes. */
export function serializeTokens(nodes: TokenNode[]): string {
  return nodes.map((n) => (typeof n === "string" ? n : `{{${n.path}}}`)).join("");
}

/** Every token path used in the text that is not in the catalogue (deduped). */
export function unknownTokens(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(TOKEN_RE)) {
    if (!KNOWN_TOKEN_PATHS.has(m[1]!)) out.add(m[1]!);
  }
  return [...out];
}

/**
 * Representative sample values for every token, mirroring the demo seed. Used by
 * the preview's "Beispieldaten" mode and by the test send, so an author sees a
 * realistic mail without picking a real record. `today` is filled at call time.
 */
export function sampleTokenValues(): Record<string, string> {
  const today = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  return {
    "contact.salutation": "Herr",
    "contact.firstName": "Max",
    "contact.lastName": "Mustermann",
    "contact.email": "max.mustermann@muster-ag.de",
    "company.name": "Muster AG",
    "company.city": "München",
    "company.vatId": "DE812345678",
    "deal.title": "Jahreslizenz Muster AG",
    "deal.amount": "12.000,00 EUR",
    "deal.stage": "Angebot",
    "deal.owner": "Michel Roegl-Brunner",
    "deal.closeDate": "14.03.2026",
    today,
    "org.name": "Demo GmbH",
    "user.name": "Michel Roegl-Brunner",
  };
}
