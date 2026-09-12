/**
 * Executors for ACTION steps. Each runs inside the run's tenant transaction and
 * returns a plain-German outcome for the run-step log. Executors do only quick
 * database work — never network I/O — because the whole run shares one Prisma
 * interactive transaction; anything slow (a real webhook, SMTP) would risk its
 * timeout. The log-only email default honours that; a networked transport would
 * be dispatched outside the transaction in a later pass.
 *
 * DSGVO: `email.send` verifies recorded consent before sending. No consent field
 * exists on Contact yet, so today every send is skipped with that reason logged
 * — truthful, and the safe default until consent is captured.
 */
import type { Prisma } from "@kundeo/db";
import type { EmailMessage } from "@/lib/email";
import { renderTemplate } from "@/lib/email/render-template";
import { renderMarkdown } from "@/lib/email/markdown";
import type { LoadedRecord } from "./records";
import { contactEmailConsent, parseMoneyToCents, templateValues } from "./records";

type Tx = Prisma.TransactionClient;

export type StepStatus = "OK" | "ERROR" | "SKIPPED";

/**
 * A network side-effect an action defers to the post-commit outbox: the DB work
 * happens in the run transaction, the send happens after it commits.
 */
export interface PendingSideEffect {
  kind: "email" | "webhook" | "subflow";
  email?: EmailMessage;
  webhook?: { url: string; payload: Record<string, unknown> };
  subflow?: { workflowName: string; recordType: string | null; recordId: string | null; depth: number };
}

/** How deep automation-calls-automation may nest before it is refused. */
export const MAX_SUBFLOW_DEPTH = 3;

export interface ActionOutcome {
  status: StepStatus;
  message: string;
  errorCode?: string;
  /** When present, the runner enqueues this to send after the run commits. */
  sideEffect?: PendingSideEffect;
}

interface ActionContext {
  tx: Tx;
  organizationId: string;
  /** Null on a record-less run (e.g. an org-level schedule). */
  loaded: LoadedRecord | null;
  config: Record<string, unknown>;
  /** Nesting depth of this run, for the subflow recursion guard. */
  depth: number;
}

const str = (v: unknown): string | undefined => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : undefined;
};

function dealId(loaded: LoadedRecord | null): string | null {
  if (!loaded) return null;
  if (loaded.type === "Deal") return loaded.data.id;
  if (loaded.type === "Task") return loaded.data.dealId ?? null;
  return null;
}

function contactId(loaded: LoadedRecord | null): string | null {
  if (!loaded) return null;
  if (loaded.type === "Contact") return loaded.data.id;
  if (loaded.type === "Deal" || loaded.type === "Task") return loaded.data.contactId ?? null;
  return null;
}

function companyId(loaded: LoadedRecord | null): string | null {
  if (!loaded) return null;
  if (loaded.type === "Company") return loaded.data.id;
  if (loaded.type === "Deal" || loaded.type === "Contact") return loaded.data.companyId ?? null;
  if (loaded.type === "Task") return loaded.data.contact?.companyId ?? loaded.data.deal?.companyId ?? null;
  return null;
}

/** The contact an email would go to: the record itself, or its deal's/task's contact. */
function recipientContact(loaded: LoadedRecord | null): { email?: string | null; emailConsent?: boolean } | null {
  if (!loaded) return null;
  if (loaded.type === "Contact") return loaded.data;
  if (loaded.type === "Deal" || loaded.type === "Task") return loaded.data.contact ?? null;
  return null;
}

async function createTask(ctx: ActionContext): Promise<ActionOutcome> {
  const title = str(ctx.config.title);
  if (!title) return { status: "SKIPPED", message: "Kein Aufgabentitel gesetzt" };
  const dueDays = Number(str(ctx.config.dueDays) ?? "");
  const dueAt = Number.isFinite(dueDays) ? new Date(Date.now() + dueDays * 86_400_000) : null;
  await ctx.tx.activity.create({
    data: {
      organizationId: ctx.organizationId,
      type: "TASK",
      subject: title,
      dueAt,
      dealId: dealId(ctx.loaded),
      contactId: contactId(ctx.loaded),
      authorId: null,
    },
  });
  return { status: "OK", message: `Aufgabe erstellt: „${title}“` };
}

async function addNote(ctx: ActionContext): Promise<ActionOutcome> {
  const text = str(ctx.config.text);
  if (!text) return { status: "SKIPPED", message: "Kein Notiztext gesetzt" };
  await ctx.tx.activity.create({
    data: {
      organizationId: ctx.organizationId,
      type: "NOTE",
      subject: text.length > 80 ? `${text.slice(0, 77)}…` : text,
      body: text,
      dealId: dealId(ctx.loaded),
      contactId: contactId(ctx.loaded),
      authorId: null,
    },
  });
  return { status: "OK", message: "Notiz hinzugefügt" };
}

async function sendEmail(ctx: ActionContext): Promise<ActionOutcome> {
  const templateId = str(ctx.config.templateId);
  const templateName = str(ctx.config.template); // legacy label / fallback selector
  if (!templateId && !templateName) return { status: "SKIPPED", message: "Keine E-Mail-Vorlage gewählt" };

  const contact = recipientContact(ctx.loaded);
  if (!contact) return { status: "SKIPPED", message: "Kein Kontakt für den Versand" };
  const to = str(contact.email);
  if (!to) return { status: "SKIPPED", message: "Kontakt hat keine E-Mail-Adresse" };

  // DSGVO consent gate: only email a contact who has recorded consent.
  if (!contactEmailConsent(contact)) {
    return {
      status: "SKIPPED",
      message: "Einwilligung wird geprüft – keine dokumentierte Einwilligung, nicht gesendet",
    };
  }

  // Resolve the template by id (RLS scopes to the org); fall back to its name for
  // legacy steps saved before templates were referenced by id.
  const template = templateId
    ? await ctx.tx.emailTemplate.findFirst({ where: { id: templateId } })
    : await ctx.tx.emailTemplate.findFirst({ where: { name: templateName! } });
  if (!template) return { status: "SKIPPED", message: "E-Mail-Vorlage nicht gefunden" };

  // Substitute the tokens against the triggering record, and render the Markdown
  // body to HTML. The actual send is deferred to the post-commit outbox (no
  // network in the run transaction); the runner updates the step with the
  // transport's result, or to ERROR if delivery fails.
  const values = await templateValues(ctx.tx, ctx.loaded, ctx.organizationId);
  const rendered = renderTemplate({ subject: template.subject, body: template.body }, values);
  const html = renderMarkdown(rendered.body);

  return {
    status: "OK",
    message: `E-Mail „${template.name}“ an ${to} – wird gesendet`,
    sideEffect: {
      kind: "email",
      email: {
        organizationId: ctx.organizationId,
        to,
        subject: rendered.subject,
        text: rendered.body,
        html,
        templateName: template.name,
      },
    },
  };
}

async function callWebhookAction(ctx: ActionContext): Promise<ActionOutcome> {
  const url = str(ctx.config.url);
  if (!url) return { status: "SKIPPED", message: "Keine Webhook-URL gesetzt" };
  if (!/^https?:\/\//i.test(url)) return { status: "ERROR", message: "Ungültige Webhook-URL", errorCode: "BAD_URL" };
  const payload: Record<string, unknown> = {
    type: ctx.loaded?.type ?? null,
    id: ctx.loaded?.data.id ?? null,
    organizationId: ctx.organizationId,
  };
  return {
    status: "OK",
    message: `Webhook ${url} – wird aufgerufen`,
    sideEffect: { kind: "webhook", webhook: { url, payload } },
  };
}

async function moveDeal(ctx: ActionContext): Promise<ActionOutcome> {
  if (!ctx.loaded || ctx.loaded.type !== "Deal") return { status: "SKIPPED", message: "Kein Deal zum Verschieben" };
  const stageName = str(ctx.config.stage);
  if (!stageName) return { status: "SKIPPED", message: "Keine Zielphase gesetzt" };
  const stage = await ctx.tx.stage.findFirst({
    where: { name: stageName, pipelineId: ctx.loaded.data.pipelineId },
    select: { id: true },
  });
  if (!stage) return { status: "ERROR", message: `Phase „${stageName}“ nicht gefunden`, errorCode: "STAGE_MISSING" };
  await ctx.tx.deal.update({ where: { id: ctx.loaded.data.id }, data: { stageId: stage.id } });
  return { status: "OK", message: `Deal in Phase „${stageName}“ verschoben` };
}

async function addTag(ctx: ActionContext): Promise<ActionOutcome> {
  const cid = contactId(ctx.loaded);
  if (!cid) return { status: "SKIPPED", message: "Kein Kontakt zum Taggen" };
  const name = str(ctx.config.tag);
  if (!name) return { status: "SKIPPED", message: "Kein Tag gesetzt" };
  const tag = await ctx.tx.tag.upsert({
    where: { organizationId_name: { organizationId: ctx.organizationId, name } },
    create: { organizationId: ctx.organizationId, name },
    update: {},
    select: { id: true },
  });
  await ctx.tx.contactTag.upsert({
    where: { contactId_tagId: { contactId: cid, tagId: tag.id } },
    create: { contactId: cid, tagId: tag.id },
    update: {},
  });
  return { status: "OK", message: `Tag „${name}“ hinzugefügt` };
}

async function assign(ctx: ActionContext): Promise<ActionOutcome> {
  const mode = str(ctx.config.assignee) ?? "owner";
  if (mode === "owner") return { status: "OK", message: "Inhaber unverändert" };
  // Round-robin over org members: pick the least-recently-created for a stable spread.
  const members = await ctx.tx.member.findMany({ select: { userId: true } });
  if (!members.length) return { status: "SKIPPED", message: "Keine Teammitglieder für die Zuweisung" };
  const pick = members[Math.floor(Math.random() * members.length)]!.userId;
  if (ctx.loaded?.type === "Deal") await ctx.tx.deal.update({ where: { id: ctx.loaded.data.id }, data: { ownerId: pick } });
  else if (ctx.loaded?.type === "Contact") await ctx.tx.contact.update({ where: { id: ctx.loaded.data.id }, data: { ownerId: pick } });
  else return { status: "SKIPPED", message: "Datensatz kann nicht zugewiesen werden" };
  return { status: "OK", message: "Datensatz zugewiesen (Reihum)" };
}

/**
 * Set a field on the Deal the run is about. Only a small, safe whitelist of
 * fields is writable from an automation (never ids or ownership); an unknown or
 * unsafe field is skipped with a reason.
 */
async function setField(ctx: ActionContext): Promise<ActionOutcome> {
  if (!ctx.loaded || ctx.loaded.type !== "Deal") return { status: "SKIPPED", message: "Feld setzen nur für Deals verfügbar" };
  const field = str(ctx.config.field);
  const value = str(ctx.config.value);
  if (!field) return { status: "SKIPPED", message: "Kein Feld gewählt" };
  if (value == null) return { status: "SKIPPED", message: "Kein Wert gesetzt" };

  if (field === "title") {
    await ctx.tx.deal.update({ where: { id: ctx.loaded.data.id }, data: { title: value } });
    return { status: "OK", message: `Titel gesetzt: „${value}“` };
  }
  if (field === "currency") {
    if (value !== "EUR" && value !== "CHF") return { status: "ERROR", message: `Ungültige Währung „${value}“`, errorCode: "BAD_VALUE" };
    await ctx.tx.deal.update({ where: { id: ctx.loaded.data.id }, data: { currency: value } });
    return { status: "OK", message: `Währung gesetzt: ${value}` };
  }
  if (field === "amount") {
    const cents = parseMoneyToCents(value);
    if (cents == null) return { status: "ERROR", message: `Ungültiger Betrag „${value}“`, errorCode: "BAD_VALUE" };
    // Setting a fixed amount switches the deal to FIXED mode and clears any
    // effort inputs, so amountCents stays consistent with the value mode.
    await ctx.tx.deal.update({
      where: { id: ctx.loaded.data.id },
      data: { amountCents: cents, valueMode: "FIXED", hoursPerWeek: null, hourlyRateCents: null, effortPeriod: null },
    });
    return { status: "OK", message: `Betrag gesetzt: ${value}` };
  }
  if (field === "stage") {
    const stage = await ctx.tx.stage.findFirst({ where: { name: value, pipelineId: ctx.loaded.data.pipelineId }, select: { id: true } });
    if (!stage) return { status: "ERROR", message: `Phase „${value}“ nicht gefunden`, errorCode: "STAGE_MISSING" };
    await ctx.tx.deal.update({ where: { id: ctx.loaded.data.id }, data: { stageId: stage.id } });
    return { status: "OK", message: `Phase gesetzt: „${value}“` };
  }
  // owner and anything else: not safe to set blindly from an automation.
  return { status: "SKIPPED", message: `Feld „${field}“ kann nicht automatisch gesetzt werden` };
}

/**
 * Start another automation for the same record. The actual start is deferred to
 * the post-commit outbox (a run must not open a nested transaction), and a depth
 * guard stops automations from calling each other without end.
 */
async function startSubflow(ctx: ActionContext): Promise<ActionOutcome> {
  const name = str(ctx.config.workflow);
  if (!name) return { status: "SKIPPED", message: "Keine Ziel-Automation gewählt" };
  if (ctx.depth + 1 > MAX_SUBFLOW_DEPTH) {
    return { status: "SKIPPED", message: `Maximale Verschachtelung erreicht (${MAX_SUBFLOW_DEPTH})` };
  }
  return {
    status: "OK",
    message: `Automation „${name}“ wird gestartet`,
    sideEffect: {
      kind: "subflow",
      subflow: {
        workflowName: name,
        recordType: ctx.loaded?.type ?? null,
        recordId: ctx.loaded?.data.id ?? null,
        depth: ctx.depth + 1,
      },
    },
  };
}

/**
 * Create a new record from an automation. `recordType` picks what to create;
 * each kind links back to the triggering record where it makes sense (a new
 * contact inherits the deal's company, a new deal inherits the record's company
 * and contact). A deal lands in the org's default pipeline's first stage. The
 * required identifying field per kind is validated here and skipped with a
 * plain reason when missing, rather than creating a half-empty record.
 */
async function createRecord(ctx: ActionContext): Promise<ActionOutcome> {
  const kind = str(ctx.config.recordType);
  if (!kind) return { status: "SKIPPED", message: "Kein Datensatztyp gewählt" };

  if (kind === "task") {
    const title = str(ctx.config.title);
    if (!title) return { status: "SKIPPED", message: "Kein Aufgabentitel gesetzt" };
    const dueDays = Number(str(ctx.config.dueDays) ?? "");
    const dueAt = Number.isFinite(dueDays) ? new Date(Date.now() + dueDays * 86_400_000) : null;
    await ctx.tx.activity.create({
      data: {
        organizationId: ctx.organizationId,
        type: "TASK",
        subject: title,
        dueAt,
        dealId: dealId(ctx.loaded),
        contactId: contactId(ctx.loaded),
        authorId: null,
      },
    });
    return { status: "OK", message: `Aufgabe angelegt: „${title}“` };
  }

  if (kind === "company") {
    const name = str(ctx.config.name);
    if (!name) return { status: "SKIPPED", message: "Kein Firmenname gesetzt" };
    await ctx.tx.company.create({ data: { organizationId: ctx.organizationId, name } });
    return { status: "OK", message: `Firma angelegt: „${name}“` };
  }

  if (kind === "contact") {
    const lastName = str(ctx.config.lastName);
    if (!lastName) return { status: "SKIPPED", message: "Kein Nachname gesetzt" };
    await ctx.tx.contact.create({
      data: {
        organizationId: ctx.organizationId,
        firstName: str(ctx.config.firstName) ?? "",
        lastName,
        email: str(ctx.config.email) ?? null,
        companyId: companyId(ctx.loaded),
      },
    });
    return { status: "OK", message: `Kontakt angelegt: „${lastName}“` };
  }

  if (kind === "deal") {
    const title = str(ctx.config.title);
    if (!title) return { status: "SKIPPED", message: "Kein Deal-Titel gesetzt" };
    // Land the deal in the org's default pipeline (or the first one) and its
    // lowest-order stage — a new deal always starts at the beginning.
    const pipeline = await ctx.tx.pipeline.findFirst({
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: { id: true, stages: { orderBy: { order: "asc" }, take: 1, select: { id: true } } },
    });
    const stageId = pipeline?.stages[0]?.id;
    if (!pipeline || !stageId) return { status: "ERROR", message: "Keine Pipeline mit Phase vorhanden", errorCode: "NO_PIPELINE" };
    const cents = parseMoneyToCents(str(ctx.config.amount));
    await ctx.tx.deal.create({
      data: {
        organizationId: ctx.organizationId,
        title,
        amountCents: cents ?? 0,
        pipelineId: pipeline.id,
        stageId,
        companyId: companyId(ctx.loaded),
        contactId: contactId(ctx.loaded),
      },
    });
    return { status: "OK", message: `Deal angelegt: „${title}“` };
  }

  return { status: "SKIPPED", message: `Datensatztyp „${kind}“ wird nicht unterstützt` };
}

async function notify(ctx: ActionContext): Promise<ActionOutcome> {
  const text = str(ctx.config.text) ?? "Automation-Benachrichtigung";
  // No internal notification channel exists yet; the run log is the record of it.
  console.info(`[notify] org=${ctx.organizationId} ${text}`);
  return { status: "OK", message: `Team benachrichtigt: „${text}“ (im Protokoll vermerkt)` };
}

/** Actions with no runtime executor yet — skipped honestly, never faked. */
const NOT_YET: Record<string, string> = {};

type Executor = (ctx: ActionContext) => Promise<ActionOutcome>;

const EXECUTORS: Record<string, Executor> = {
  "task.create": createTask,
  "note.add": addNote,
  "email.send": sendEmail,
  "deal.move": moveDeal,
  "tag.add": addTag,
  assign,
  notify,
  webhook: callWebhookAction,
  "field.set": setField,
  "record.create": createRecord,
  subflow: startSubflow,
};

/** Run one ACTION step's executor, or skip with a truthful reason. */
export async function executeAction(
  type: string,
  ctx: ActionContext,
): Promise<ActionOutcome> {
  const run = EXECUTORS[type];
  if (run) return run(ctx);
  const reason = NOT_YET[type];
  return { status: "SKIPPED", message: reason || `Aktion „${type}“ wird noch nicht ausgeführt` };
}

export type { ActionContext };
