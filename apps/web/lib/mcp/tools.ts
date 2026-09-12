import "server-only";
import type { Prisma } from "@kundeo/db";
import type { McpContext } from "./auth";
import type { EventMeta, EventRecord, TriggerKind } from "@/lib/automations/events";

/**
 * The CRM tool surface exposed to MCP clients (Claude Cowork, Claude Desktop, …).
 *
 * Every handler runs inside a tenant-scoped transaction (RLS enforced) for the
 * caller's organization — see server.ts. Handlers therefore never filter by
 * organizationId themselves and never receive the bare client. Writes describe
 * the automation events they cause via the returned `events`; the server
 * dispatches them after the transaction commits, mirroring the server actions.
 */

export interface ToolResult {
  /** Text payload returned to the agent (we serialise records as JSON). */
  text: string;
  /** Automation trigger events to dispatch after the write commits. */
  events?: { kind: TriggerKind; record: EventRecord; meta?: EventMeta }[];
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Write tools require a read_write key; read tools work with any live key. */
  write?: boolean;
  handler: (
    db: Prisma.TransactionClient,
    ctx: McpContext,
    args: Record<string, unknown>,
  ) => Promise<ToolResult>;
}

// ── argument helpers ─────────────────────────────────────────────────────────

/** Raised by a handler for bad input; the server maps it to a tool error. */
export class ToolInputError extends Error {}

function str(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw new ToolInputError(`"${key}" must be a string`);
  const t = v.trim();
  return t.length ? t : undefined;
}

function requireStr(args: Record<string, unknown>, key: string): string {
  const v = str(args, key);
  if (v === undefined) throw new ToolInputError(`"${key}" is required`);
  return v;
}

function int(args: Record<string, unknown>, key: string): number | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !Number.isInteger(v)) {
    throw new ToolInputError(`"${key}" must be an integer`);
  }
  return v;
}

function limit(args: Record<string, unknown>, fallback = 25, max = 100): number {
  const v = int(args, "limit");
  if (v === undefined) return fallback;
  return Math.min(Math.max(v, 1), max);
}

function oneOf<T extends string>(
  args: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const v = str(args, key);
  if (v === undefined) return undefined;
  if (!allowed.includes(v as T)) {
    throw new ToolInputError(`"${key}" must be one of: ${allowed.join(", ")}`);
  }
  return v as T;
}

function dateVal(args: Record<string, unknown>, key: string): Date | undefined {
  const v = str(args, key);
  if (v === undefined) return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new ToolInputError(`"${key}" must be an ISO date`);
  return d;
}

function ok(data: unknown, events?: ToolResult["events"]): ToolResult {
  return { text: JSON.stringify(data, null, 2), events };
}

// ── JSON Schema helpers ──────────────────────────────────────────────────────

const S = {
  string: (description: string) => ({ type: "string", description }),
  integer: (description: string) => ({ type: "integer", description }),
  enumStr: (description: string, values: readonly string[]) => ({
    type: "string",
    enum: [...values],
    description,
  }),
} as const;

function schema(
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> {
  return { type: "object", properties, required, additionalProperties: false };
}

const CONTACT_FIELDS = {
  salutation: S.string('Anrede, e.g. "Herr" or "Frau".'),
  title: S.string('Academic title, e.g. "Dr.".'),
  firstName: S.string("Given name."),
  lastName: S.string("Family name."),
  email: S.string("Email address."),
  phone: S.string("Phone number."),
  position: S.string("Job title / role at the company."),
  companyId: S.string("Id of the company this contact belongs to."),
  notes: S.string("Free-form notes."),
};

const COMPANY_FIELDS = {
  name: S.string("Company name."),
  domain: S.string('Primary domain, e.g. "example.com".'),
  industry: S.string("Industry / Branche."),
  vatId: S.string("USt-IdNr. / UID."),
  street: S.string("Street address."),
  postalCode: S.string("Postal code / PLZ."),
  city: S.string("City."),
  country: S.enumStr("ISO country. One of DE, AT, CH.", ["DE", "AT", "CH"]),
  phone: S.string("Phone number."),
  website: S.string("Website URL."),
  notes: S.string("Free-form notes."),
};

const DEAL_STATUS = ["OPEN", "WON", "LOST"] as const;
const ACTIVITY_TYPE = ["NOTE", "CALL", "EMAIL", "MEETING", "TASK"] as const;
const CURRENCY = ["EUR", "CHF"] as const;

function contactData(args: Record<string, unknown>) {
  return {
    salutation: str(args, "salutation"),
    title: str(args, "title"),
    email: str(args, "email"),
    phone: str(args, "phone"),
    position: str(args, "position"),
    companyId: str(args, "companyId"),
    notes: str(args, "notes"),
  };
}

// ── the registry ─────────────────────────────────────────────────────────────

export const TOOLS: ToolDef[] = [
  // — Contacts —
  {
    name: "search_contacts",
    description:
      "Search contacts by name or email within the organization. Returns the most recently updated matches when no query is given.",
    inputSchema: schema({
      query: S.string("Case-insensitive match against first name, last name or email."),
      limit: S.integer("Max results (1–100, default 25)."),
    }),
    handler: async (db, _ctx, args) => {
      const q = str(args, "query");
      const where: Prisma.ContactWhereInput = q
        ? {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : {};
      const contacts = await db.contact.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: limit(args),
        include: { company: { select: { id: true, name: true } } },
      });
      return ok(contacts);
    },
  },
  {
    name: "get_contact",
    description: "Fetch a single contact by id, including its company, deals and recent activities.",
    inputSchema: schema({ id: S.string("Contact id.") }, ["id"]),
    handler: async (db, _ctx, args) => {
      const contact = await db.contact.findUnique({
        where: { id: requireStr(args, "id") },
        include: {
          company: { select: { id: true, name: true } },
          deals: { select: { id: true, title: true, status: true, amountCents: true, currency: true } },
          activities: { orderBy: { createdAt: "desc" }, take: 10 },
        },
      });
      if (!contact) throw new ToolInputError("Contact not found");
      return ok(contact);
    },
  },
  {
    name: "create_contact",
    description: "Create a new contact. firstName and lastName are required.",
    write: true,
    inputSchema: schema(CONTACT_FIELDS, ["firstName", "lastName"]),
    handler: async (db, _ctx, args) => {
      const contact = await db.contact.create({
        data: {
          firstName: requireStr(args, "firstName"),
          lastName: requireStr(args, "lastName"),
          ...contactData(args),
          organizationId: _ctx.organizationId,
        },
      });
      return ok(contact, [{ kind: "contact.created", record: { type: "Contact", id: contact.id } }]);
    },
  },
  {
    name: "update_contact",
    description: "Update fields on an existing contact. Only the fields you pass are changed.",
    write: true,
    inputSchema: schema({ id: S.string("Contact id."), ...CONTACT_FIELDS }, ["id"]),
    handler: async (db, _ctx, args) => {
      const id = requireStr(args, "id");
      const data: Prisma.ContactUpdateInput = {
        ...contactData(args),
        firstName: str(args, "firstName"),
        lastName: str(args, "lastName"),
      };
      const contact = await db.contact.update({ where: { id }, data });
      return ok(contact, [{ kind: "contact.updated", record: { type: "Contact", id } }]);
    },
  },

  // — Companies —
  {
    name: "list_companies",
    description: "List or search companies by name within the organization.",
    inputSchema: schema({
      query: S.string("Case-insensitive match against the company name."),
      limit: S.integer("Max results (1–100, default 25)."),
    }),
    handler: async (db, _ctx, args) => {
      const q = str(args, "query");
      const companies = await db.company.findMany({
        where: q ? { name: { contains: q, mode: "insensitive" } } : {},
        orderBy: { name: "asc" },
        take: limit(args),
      });
      return ok(companies);
    },
  },
  {
    name: "create_company",
    description: "Create a new company. name is required.",
    write: true,
    inputSchema: schema(COMPANY_FIELDS, ["name"]),
    handler: async (db, _ctx, args) => {
      const company = await db.company.create({
        data: {
          name: requireStr(args, "name"),
          domain: str(args, "domain"),
          industry: str(args, "industry"),
          vatId: str(args, "vatId"),
          street: str(args, "street"),
          postalCode: str(args, "postalCode"),
          city: str(args, "city"),
          country: oneOf(args, "country", ["DE", "AT", "CH"]) ?? "DE",
          phone: str(args, "phone"),
          website: str(args, "website"),
          notes: str(args, "notes"),
          organizationId: _ctx.organizationId,
        },
      });
      return ok(company, [{ kind: "company.created", record: { type: "Company", id: company.id } }]);
    },
  },

  // — Pipelines & deals —
  {
    name: "list_pipelines",
    description:
      "List the organization's pipelines with their stages (id, name, order). Use this to find the pipelineId and stageId needed to create a deal.",
    inputSchema: schema({}),
    handler: async (db) => {
      const pipelines = await db.pipeline.findMany({
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        include: {
          stages: { orderBy: { order: "asc" }, select: { id: true, name: true, order: true, probability: true } },
        },
      });
      return ok(pipelines);
    },
  },
  {
    name: "list_deals",
    description: "List deals, optionally filtered by status or stage.",
    inputSchema: schema({
      status: S.enumStr("Filter by status.", DEAL_STATUS),
      stageId: S.string("Filter by stage id."),
      limit: S.integer("Max results (1–100, default 25)."),
    }),
    handler: async (db, _ctx, args) => {
      const status = oneOf(args, "status", DEAL_STATUS);
      const stageId = str(args, "stageId");
      const deals = await db.deal.findMany({
        where: { ...(status ? { status } : {}), ...(stageId ? { stageId } : {}) },
        orderBy: { updatedAt: "desc" },
        take: limit(args),
        include: {
          stage: { select: { id: true, name: true } },
          company: { select: { id: true, name: true } },
          contact: { select: { id: true, firstName: true, lastName: true } },
        },
      });
      return ok(deals);
    },
  },
  {
    name: "get_deal",
    description: "Fetch a single deal by id with its stage, company, contact and activities.",
    inputSchema: schema({ id: S.string("Deal id.") }, ["id"]),
    handler: async (db, _ctx, args) => {
      const deal = await db.deal.findUnique({
        where: { id: requireStr(args, "id") },
        include: {
          pipeline: { select: { id: true, name: true } },
          stage: { select: { id: true, name: true } },
          company: { select: { id: true, name: true } },
          contact: { select: { id: true, firstName: true, lastName: true } },
          activities: { orderBy: { createdAt: "desc" }, take: 10 },
        },
      });
      if (!deal) throw new ToolInputError("Deal not found");
      return ok(deal);
    },
  },
  {
    name: "create_deal",
    description:
      "Create a new deal. title, pipelineId and stageId are required — call list_pipelines first to get valid ids. Amounts are integer minor units (cents).",
    write: true,
    inputSchema: schema(
      {
        title: S.string("Deal title."),
        pipelineId: S.string("Pipeline id (from list_pipelines)."),
        stageId: S.string("Stage id within that pipeline (from list_pipelines)."),
        amountCents: S.integer("Value in minor units (cents). Defaults to 0."),
        currency: S.enumStr("Currency. One of EUR, CHF. Defaults to EUR.", CURRENCY),
        companyId: S.string("Associated company id."),
        contactId: S.string("Associated contact id."),
        expectedCloseAt: S.string("Expected close date (ISO 8601)."),
      },
      ["title", "pipelineId", "stageId"],
    ),
    handler: async (db, _ctx, args) => {
      const deal = await db.deal.create({
        data: {
          title: requireStr(args, "title"),
          pipelineId: requireStr(args, "pipelineId"),
          stageId: requireStr(args, "stageId"),
          amountCents: int(args, "amountCents") ?? 0,
          currency: oneOf(args, "currency", CURRENCY) ?? "EUR",
          companyId: str(args, "companyId"),
          contactId: str(args, "contactId"),
          expectedCloseAt: dateVal(args, "expectedCloseAt"),
          organizationId: _ctx.organizationId,
        },
      });
      return ok(deal, [{ kind: "deal.created", record: { type: "Deal", id: deal.id } }]);
    },
  },

  // — Activities —
  {
    name: "list_activities",
    description: "List activities, optionally filtered by contact or deal.",
    inputSchema: schema({
      contactId: S.string("Filter by contact id."),
      dealId: S.string("Filter by deal id."),
      limit: S.integer("Max results (1–100, default 25)."),
    }),
    handler: async (db, _ctx, args) => {
      const contactId = str(args, "contactId");
      const dealId = str(args, "dealId");
      const activities = await db.activity.findMany({
        where: { ...(contactId ? { contactId } : {}), ...(dealId ? { dealId } : {}) },
        orderBy: { createdAt: "desc" },
        take: limit(args),
      });
      return ok(activities);
    },
  },
  {
    name: "create_activity",
    description:
      "Log an activity (note, call, email, meeting or task) against a contact and/or deal. A TASK may carry a dueAt.",
    write: true,
    inputSchema: schema(
      {
        type: S.enumStr("Activity type.", ACTIVITY_TYPE),
        subject: S.string("Short subject line."),
        body: S.string("Optional details."),
        contactId: S.string("Associated contact id."),
        dealId: S.string("Associated deal id."),
        dueAt: S.string("Due date for a TASK (ISO 8601)."),
      },
      ["type", "subject"],
    ),
    handler: async (db, ctx, args) => {
      const type = oneOf(args, "type", ACTIVITY_TYPE)!;
      const activity = await db.activity.create({
        data: {
          type,
          subject: requireStr(args, "subject"),
          body: str(args, "body"),
          contactId: str(args, "contactId"),
          dealId: str(args, "dealId"),
          dueAt: dateVal(args, "dueAt"),
          authorId: ctx.userId,
          organizationId: ctx.organizationId,
        },
      });
      // Mirror the app: creating a TASK is what fires the task.created trigger.
      const events =
        type === "TASK"
          ? ([{ kind: "task.created", record: { type: "Task", id: activity.id } }] as ToolResult["events"])
          : undefined;
      return ok(activity, events);
    },
  },
];

export const TOOLS_BY_NAME: Map<string, ToolDef> = new Map(TOOLS.map((t) => [t.name, t]));
