/**
 * The translation layer between the builder's plain-German pickers and the
 * actual schema. Conditions are authored as entity → field → operator → value
 * in German ("Deal · Betrag · ist größer als · 10.000 EUR"); the schema stores
 * `amountCents`, `stageId`, English column names. This module loads the record a
 * run operates on and evaluates a FilterClause against it.
 *
 * Conservative by design: when a clause cannot be resolved (unknown field, a
 * related record that is absent), it evaluates to false rather than guessing —
 * an automation never fires an action on an unmet-but-assumed condition.
 */
import type { Prisma } from "@kundeo/db";
import { FIELDS, type FilterClause, type FieldKind } from "@/components/automations/catalogue";
import { formatDate, formatMoney } from "@/lib/format";

/** English record type as stored on WorkflowRun.recordType. */
export type RecordType = "Deal" | "Contact" | "Company" | "Task";

type Tx = Prisma.TransactionClient;

/** A loaded record plus the relations conditions may reach across. */
export interface LoadedRecord {
  type: RecordType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

/** Load the record a run operates on, with the relations conditions can read. */
export async function loadRecord(
  tx: Tx,
  type: RecordType,
  id: string,
): Promise<LoadedRecord | null> {
  if (type === "Deal") {
    const data = await tx.deal.findFirst({ where: { id }, include: { stage: true, company: true, contact: true } });
    return data ? { type, data } : null;
  }
  if (type === "Contact") {
    const data = await tx.contact.findFirst({ where: { id }, include: { company: true } });
    return data ? { type, data } : null;
  }
  if (type === "Task") {
    // A Task is an Activity(type=TASK). Load the contact/deal it hangs off so
    // conditions and actions can reach through to those records.
    const data = await tx.activity.findFirst({
      where: { id, type: "TASK" },
      include: { contact: { include: { company: true } }, deal: { include: { stage: true, company: true, contact: true } } },
    });
    return data ? { type, data } : null;
  }
  const data = await tx.company.findFirst({ where: { id } });
  return data ? { type, data } : null;
}

const GERMAN_TO_TYPE: Record<string, RecordType> = { Deal: "Deal", Firma: "Company", Kontakt: "Contact" };

function defaultEntity(type: RecordType): string {
  if (type === "Deal") return "Deal";
  if (type === "Company") return "Firma";
  return "Kontakt"; // Contact and Task both default to contact-scoped conditions
}

/** Resolve the object a German entity name refers to, following relations. */
function entityObject(loaded: LoadedRecord, entity: string): Record<string, unknown> | null {
  const target = GERMAN_TO_TYPE[entity];
  if (!target) return null;
  if (target === loaded.type) return loaded.data;
  // Cross-entity: reach through the loaded record's relations where they exist.
  if (loaded.type === "Deal" && target === "Company") return loaded.data.company ?? null;
  if (loaded.type === "Deal" && target === "Contact") return loaded.data.contact ?? null;
  if (loaded.type === "Contact" && target === "Company") return loaded.data.company ?? null;
  if (loaded.type === "Task" && target === "Contact") return loaded.data.contact ?? null;
  if (loaded.type === "Task" && target === "Deal") return loaded.data.deal ?? null;
  if (loaded.type === "Task" && target === "Company") return loaded.data.contact?.company ?? loaded.data.deal?.company ?? null;
  return null;
}

/** The comparable value for a (entity, field) pair, mapped to schema columns. */
function fieldValue(obj: Record<string, unknown>, entity: string, field: string): unknown {
  if (entity === "Deal") {
    if (field === "amount") return obj.amountCents; // minor units
    if (field === "stage") return (obj.stage as { name?: string } | null)?.name ?? null;
    if (field === "owner") return obj.ownerId ?? null;
  }
  // Kontakt.consent maps to the recorded email-consent flag (DSGVO).
  if (entity === "Kontakt" && field === "consent") return obj.emailConsent === true;
  return obj[field] ?? null;
}

function fieldKind(entity: string, field: string): FieldKind {
  const def = (FIELDS[entity] ?? []).find((f) => f.value === field);
  return def?.kind ?? "text";
}

/** German money string ("10.000", "1.234,56") → integer minor units (cents). */
export function parseMoneyToCents(value: string | undefined): number | null {
  if (!value) return null;
  const normalised = value.replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(normalised);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

function eqText(a: unknown, b: string | undefined): boolean {
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
}

function isEmpty(a: unknown): boolean {
  return a == null || String(a).trim() === "";
}

/** Evaluate one condition/filter clause against the loaded record. */
export function evaluateClause(clause: FilterClause, loaded: LoadedRecord): boolean {
  const entity = clause.entity ?? defaultEntity(loaded.type);
  const obj = entityObject(loaded, entity);
  if (!obj) return false; // related record absent → conservative false
  const kind = fieldKind(entity, clause.field);
  const actual = fieldValue(obj, entity, clause.field);
  const op = clause.op;
  const expected = clause.value;

  if (kind === "money") {
    const a = typeof actual === "number" ? actual : parseMoneyToCents(String(actual ?? ""));
    const e = parseMoneyToCents(expected);
    if (a == null || e == null) return false;
    if (op === "ist größer als") return a > e;
    if (op === "ist kleiner als") return a < e;
    if (op === "ist genau") return a === e;
    return false; // "liegt zwischen" needs two bounds — unsupported for now
  }

  if (kind === "bool") {
    const truthy = actual === true;
    if (op === "liegt vor") return truthy;
    if (op === "liegt nicht vor") return !truthy;
    return false;
  }

  // text / enum / user
  if (op === "ist leer") return isEmpty(actual);
  if (op === "ist") return eqText(actual, expected);
  if (op === "ist nicht") return !eqText(actual, expected);
  if (op === "enthält") return String(actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
  if (op === "ist eine von") {
    const options = String(expected ?? "").split(",").map((s) => s.trim().toLowerCase());
    return options.includes(String(actual ?? "").trim().toLowerCase());
  }
  return false;
}

/** All clauses must pass (used for trigger `filters` and FILTER steps). */
export function evaluateAll(clauses: FilterClause[], loaded: LoadedRecord): boolean {
  return clauses.every((c) => evaluateClause(c, loaded));
}

/** DSGVO gate: has this contact recorded email consent? */
export function contactEmailConsent(contact: { emailConsent?: boolean } | null | undefined): boolean {
  return contact?.emailConsent === true;
}

/** The contact/company/deal a loaded record resolves to, following relations. */
function relatedObjects(loaded: LoadedRecord | null): {
  contact: Record<string, unknown> | null;
  company: Record<string, unknown> | null;
  deal: Record<string, unknown> | null;
} {
  if (!loaded) return { contact: null, company: null, deal: null };
  const d = loaded.data;
  if (loaded.type === "Contact") return { contact: d, company: d.company ?? null, deal: null };
  if (loaded.type === "Company") return { contact: null, company: d, deal: null };
  if (loaded.type === "Deal") return { contact: d.contact ?? null, company: d.company ?? null, deal: d };
  // Task
  return {
    contact: d.contact ?? null,
    company: d.contact?.company ?? d.deal?.company ?? null,
    deal: d.deal ?? null,
  };
}

/**
 * Resolve concrete values for email-template tokens (see email-tokens.ts) from
 * the record a run operates on, plus org/user context. Missing values are left
 * out — the renderer substitutes an empty string for anything absent.
 */
export async function templateValues(
  tx: Tx,
  loaded: LoadedRecord | null,
  organizationId: string,
): Promise<Record<string, string>> {
  const values: Record<string, string> = { today: formatDate(new Date()) };

  const org = await tx.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
  if (org?.name) values["org.name"] = org.name;

  const { contact, company, deal } = relatedObjects(loaded);

  if (contact) {
    values["contact.salutation"] = String(contact.salutation ?? "");
    values["contact.firstName"] = String(contact.firstName ?? "");
    values["contact.lastName"] = String(contact.lastName ?? "");
    values["contact.email"] = String(contact.email ?? "");
  }
  if (company) {
    values["company.name"] = String(company.name ?? "");
    values["company.city"] = String(company.city ?? "");
    values["company.vatId"] = String(company.vatId ?? "");
  }
  if (deal) {
    values["deal.title"] = String(deal.title ?? "");
    values["deal.amount"] = formatMoney(Number(deal.amountCents ?? 0), String(deal.currency ?? "EUR"));
    values["deal.stage"] = String((deal.stage as { name?: string } | null)?.name ?? "");
    values["deal.closeDate"] = deal.expectedCloseAt ? formatDate(deal.expectedCloseAt as Date) : "";
    const ownerId = deal.ownerId ? String(deal.ownerId) : "";
    if (ownerId) {
      const owner = await tx.user.findUnique({ where: { id: ownerId }, select: { name: true } });
      if (owner?.name) values["deal.owner"] = owner.name;
    }
  }

  return values;
}
