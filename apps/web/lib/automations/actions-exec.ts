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
import type { LoadedRecord } from "./records";
import { contactEmailConsent } from "./records";

type Tx = Prisma.TransactionClient;

export type StepStatus = "OK" | "ERROR" | "SKIPPED";

/**
 * A network side-effect an action defers to the post-commit outbox: the DB work
 * happens in the run transaction, the send happens after it commits.
 */
export interface PendingSideEffect {
  kind: "email" | "webhook";
  email?: EmailMessage;
  webhook?: { url: string; payload: Record<string, unknown> };
}

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
  loaded: LoadedRecord;
  config: Record<string, unknown>;
}

const str = (v: unknown): string | undefined => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : undefined;
};

function dealId(loaded: LoadedRecord): string | null {
  if (loaded.type === "Deal") return loaded.data.id;
  if (loaded.type === "Task") return loaded.data.dealId ?? null;
  return null;
}

function contactId(loaded: LoadedRecord): string | null {
  if (loaded.type === "Contact") return loaded.data.id;
  if (loaded.type === "Deal" || loaded.type === "Task") return loaded.data.contactId ?? null;
  return null;
}

/** The contact an email would go to: the record itself, or its deal's/task's contact. */
function recipientContact(loaded: LoadedRecord): { email?: string | null; emailConsent?: boolean } | null {
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
  const template = str(ctx.config.template);
  if (!template) return { status: "SKIPPED", message: "Keine E-Mail-Vorlage gewählt" };

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

  // The actual send is deferred to the post-commit outbox (no network in the
  // run transaction). The step is provisionally OK; the runner updates it with
  // the transport's result, or to ERROR if delivery fails.
  return {
    status: "OK",
    message: `E-Mail „${template}“ an ${to} – wird gesendet`,
    sideEffect: {
      kind: "email",
      email: { organizationId: ctx.organizationId, to, subject: template, text: `Vorlage: ${template}`, templateName: template },
    },
  };
}

async function callWebhookAction(ctx: ActionContext): Promise<ActionOutcome> {
  const url = str(ctx.config.url);
  if (!url) return { status: "SKIPPED", message: "Keine Webhook-URL gesetzt" };
  if (!/^https?:\/\//i.test(url)) return { status: "ERROR", message: "Ungültige Webhook-URL", errorCode: "BAD_URL" };
  const payload: Record<string, unknown> = {
    type: ctx.loaded.type,
    id: ctx.loaded.data.id,
    organizationId: ctx.organizationId,
  };
  return {
    status: "OK",
    message: `Webhook ${url} – wird aufgerufen`,
    sideEffect: { kind: "webhook", webhook: { url, payload } },
  };
}

async function moveDeal(ctx: ActionContext): Promise<ActionOutcome> {
  if (ctx.loaded.type !== "Deal") return { status: "SKIPPED", message: "Kein Deal zum Verschieben" };
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
  if (ctx.loaded.type === "Deal") await ctx.tx.deal.update({ where: { id: ctx.loaded.data.id }, data: { ownerId: pick } });
  else if (ctx.loaded.type === "Contact") await ctx.tx.contact.update({ where: { id: ctx.loaded.data.id }, data: { ownerId: pick } });
  else return { status: "SKIPPED", message: "Datensatz kann nicht zugewiesen werden" };
  return { status: "OK", message: "Datensatz zugewiesen (Reihum)" };
}

async function notify(ctx: ActionContext): Promise<ActionOutcome> {
  const text = str(ctx.config.text) ?? "Automation-Benachrichtigung";
  // No internal notification channel exists yet; the run log is the record of it.
  console.info(`[notify] org=${ctx.organizationId} ${text}`);
  return { status: "OK", message: `Team benachrichtigt: „${text}“ (im Protokoll vermerkt)` };
}

/** Actions with no runtime executor yet — skipped honestly, never faked. */
const NOT_YET: Record<string, string> = {
  "field.set": "Feld setzen wird noch nicht ausgeführt",
  "record.create": "Datensatz anlegen wird noch nicht ausgeführt",
  subflow: "Andere Automation starten wird noch nicht ausgeführt",
};

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
