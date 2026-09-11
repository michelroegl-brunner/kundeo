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

/** English record type as stored on WorkflowRun.recordType. */
export type RecordType = "Deal" | "Contact" | "Company";

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
  const data = await tx.company.findFirst({ where: { id } });
  return data ? { type, data } : null;
}

const GERMAN_TO_TYPE: Record<string, RecordType> = { Deal: "Deal", Firma: "Company", Kontakt: "Contact" };

function defaultEntity(type: RecordType): string {
  return type === "Deal" ? "Deal" : type === "Company" ? "Firma" : "Kontakt";
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
  return null;
}

/** The comparable value for a (entity, field) pair, mapped to schema columns. */
function fieldValue(obj: Record<string, unknown>, entity: string, field: string): unknown {
  if (entity === "Deal") {
    if (field === "amount") return obj.amountCents; // minor units
    if (field === "stage") return (obj.stage as { name?: string } | null)?.name ?? null;
    if (field === "owner") return obj.ownerId ?? null;
  }
  // Kontakt.consent has no backing column yet — DSGVO-safe: treated as "not
  // recorded" so "liegt nicht vor" is true and "liegt vor" is false. A future
  // consent field (email-templates work) flips this in one place.
  if (entity === "Kontakt" && field === "consent") return false;
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
