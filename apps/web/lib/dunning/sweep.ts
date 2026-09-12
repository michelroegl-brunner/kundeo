/**
 * The Mahnwesen sweep. Kundeo owns dunning end to end: the FreeFinance 2.0 API
 * has no reminder resource, so we compute Verzugszinsen + Mahngebühren here,
 * escalate through the org's configurable ladder and send each Mahnung by email
 * (attaching the original FreeFinance invoice PDF when it is available).
 *
 * It runs on the same in-process ticker as the automation delays and the
 * FreeFinance job sweep (see lib/automations/ticker.ts). Like those, the
 * network I/O (email, PDF fetch) happens outside any database transaction: we
 * claim the next Mahnstufe with a guarded update, then send, then record the
 * run. A crash between claim and record loses only the audit row, never
 * escalates twice — the guarded bump is the lease.
 */
import "server-only";
import { prisma, withOrg, type Prisma } from "@kundeo/db";
import { getEmailSender } from "@/lib/email";
import { renderTemplate } from "@/lib/email/render-template";
import { getDocumentPdf, type DocumentAttachment } from "@/lib/freefinance/documents";
import { daysOverdue, isDunningDue, computeInterestCents, openCents, type DunningPolicyShape } from "./math";

const BATCH_PER_ORG = 50;

interface LevelRow {
  level: number;
  label: string;
  feeCents: number;
  interestBps: number;
  emailTemplateId: string | null;
}

interface PolicyRow extends DunningPolicyShape {
  organizationId: string;
  levels: LevelRow[];
}

export interface DunningOutcome {
  ok: boolean;
  /** Plain-German detail for a server-action toast or the ticker log. */
  message: string;
  level?: number;
}

/** German cents → "1.234,56 €". */
function eur(cents: number, currency = "EUR"): string {
  const sign = cents < 0 ? "-" : "";
  const s = Math.abs(cents).toString().padStart(3, "0");
  const whole = s.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${whole},${s.slice(-2)} ${currency === "EUR" ? "€" : currency}`;
}

function fmtDate(d: Date | null): string {
  return d ? d.toLocaleDateString("de-AT") : "";
}

/** A built-in Mahnung body when a Stufe has no configured email template. */
function fallbackBody(label: string): { subject: string; body: string } {
  return {
    subject: `${label} zu Rechnung {{nummer}}`,
    body:
      `Sehr geehrte Damen und Herren,\n\n` +
      `zur Rechnung {{nummer}} vom {{faellig_am}} ist ein offener Betrag von {{betrag_offen}} ` +
      `seit {{tage_ueberfaellig}} Tagen fällig.\n\n` +
      `Wir dürfen Sie höflich an die Begleichung erinnern. Mahngebühr: {{gebuehr}}, ` +
      `Verzugszinsen: {{zinsen}}. Offener Gesamtbetrag: {{summe}}.\n\n` +
      `Die Rechnung finden Sie im Anhang.\n\nMit freundlichen Grüßen`,
  };
}

interface ResolvedMessage {
  to: string;
  subject: string;
  text: string;
  templateName?: string;
  /** FreeFinance ref for the courtesy PDF, fetched AFTER the transaction commits. */
  pdfRef: { externalId: string; number: string | null } | null;
}

/**
 * Resolve the recipient and render the template — database reads only, safe to
 * run inside the claim transaction. The PDF (network I/O) is deliberately NOT
 * fetched here; the caller fetches it after commit, per the project's outbox
 * rule that no network call runs inside a transaction.
 */
async function resolveMessage(
  tx: Prisma.TransactionClient,
  invoice: { id: string; companyId: string | null; contactId: string | null; externalNumber: string | null; dueDate: Date | null; currency: string },
  level: LevelRow,
  amounts: { openBeforeCents: number; feeCents: number; interestCents: number; totalCents: number; days: number },
): Promise<ResolvedMessage | null> {
  const contact = invoice.contactId
    ? await tx.contact.findUnique({ where: { id: invoice.contactId } })
    : invoice.companyId
      ? (await tx.company.findUnique({ where: { id: invoice.companyId }, include: { contacts: { take: 1, orderBy: { createdAt: "asc" } } } }))?.contacts[0] ?? null
      : null;
  const to = contact?.email?.trim() ?? "";
  if (!to) return null;

  const company = invoice.companyId ? await tx.company.findUnique({ where: { id: invoice.companyId }, select: { name: true } }) : null;
  const tpl = level.emailTemplateId ? await tx.emailTemplate.findUnique({ where: { id: level.emailTemplateId } }) : null;
  const base = tpl ? { subject: tpl.subject, body: tpl.body } : fallbackBody(level.label);

  const values = {
    nummer: invoice.externalNumber ?? "",
    kunde: company?.name ?? "",
    stufe: level.label,
    betrag_offen: eur(amounts.openBeforeCents, invoice.currency),
    gebuehr: eur(amounts.feeCents, invoice.currency),
    zinsen: eur(amounts.interestCents, invoice.currency),
    summe: eur(amounts.totalCents, invoice.currency),
    tage_ueberfaellig: String(amounts.days),
    faellig_am: fmtDate(invoice.dueDate),
  };
  const rendered = renderTemplate(base, values);

  const ref = await tx.externalRef.findFirst({ where: { provider: "freefinance", entityType: "invoice", entityId: invoice.id } });
  return {
    to,
    subject: rendered.subject,
    text: rendered.body,
    templateName: tpl?.name,
    pdfRef: ref?.externalId ? { externalId: ref.externalId, number: invoice.externalNumber } : null,
  };
}

/**
 * Issue the next Mahnstufe for one invoice. Claims the rung with a guarded bump
 * (so a concurrent tick cannot double-send), sends the email, then records the
 * DunningRun. `force` skips the due-date check (the manual „Jetzt mahnen"
 * button) but still honours the paid/cap/pause guards.
 */
async function issueForInvoice(
  organizationId: string,
  invoiceId: string,
  policy: PolicyRow,
  now: Date,
  force: boolean,
): Promise<DunningOutcome> {
  const levels = [...policy.levels].sort((a, b) => a.level - b.level);
  const maxLevel = levels.at(-1)?.level ?? 0;

  // Load + validate + claim in one transaction. The claim is a guarded update
  // on the current dunningLevel; only the caller that moves it forward proceeds.
  const claim = await withOrg(organizationId, async (tx) => {
    const inv = await tx.document.findUnique({ where: { id: invoiceId } });
    if (!inv || inv.kind !== "INVOICE" || inv.status !== "FINALIZED") return { state: "skip" as const, reason: "Kein finalisierter Rechnungsbeleg" };

    const open = openCents(inv.totalCents, inv.paidCents);
    if (open <= 0) return { state: "skip" as const, reason: "Rechnung ist bereits bezahlt" };
    if (inv.dunningLevel >= maxLevel) return { state: "skip" as const, reason: "Maximale Mahnstufe erreicht" };
    // Scheduled runs honour the due-date + pause; the manual button overrides
    // both (but never the paid/cap guards above).
    if (!force && !isDunningDue({ dueDate: inv.dueDate, openCents: open, currentLevel: inv.dunningLevel, maxLevel, pausedUntil: inv.dunningPausedUntil, policy, now }))
      return { state: "skip" as const, reason: "Noch keine Mahnung fällig" };

    const nextLevel = levels[inv.dunningLevel]; // 0-indexed rung for current level
    if (!nextLevel) return { state: "skip" as const, reason: "Keine Mahnstufe konfiguriert" };

    // Guarded claim: only advance if still at the level we read.
    const bumped = await tx.document.updateMany({
      where: { id: inv.id, dunningLevel: inv.dunningLevel, status: "FINALIZED", paymentStatus: { in: ["OPEN", "PARTIAL"] } },
      data: { dunningLevel: nextLevel.level, lastDunnedAt: now },
    });
    if (bumped.count !== 1) return { state: "raced" as const };

    const days = inv.dueDate ? daysOverdue(inv.dueDate, now) : 0;
    const interestCents = computeInterestCents(open, nextLevel.interestBps, days);
    const amounts = { openBeforeCents: open, feeCents: nextLevel.feeCents, interestCents, totalCents: open + nextLevel.feeCents + interestCents, days };
    const message = await resolveMessage(tx, inv, nextLevel, amounts);
    return { state: "claimed" as const, inv, level: nextLevel, amounts, message };
  });

  if (claim.state === "skip") return { ok: false, message: claim.reason };
  if (claim.state === "raced") return { ok: false, message: "Bereits von einem anderen Lauf verarbeitet" };

  // Post-commit: fetch the PDF (network) and send, both outside any transaction.
  let emailStatus: "SENT" | "LOGGED" | "SKIPPED" = "SKIPPED";
  let detail = "Keine E-Mail-Adresse hinterlegt";
  if (claim.message) {
    // The PDF is a courtesy attachment; a dunning must still go out if
    // FreeFinance is momentarily unreachable or the invoice was never pushed.
    let attachments: DocumentAttachment[] = [];
    if (claim.message.pdfRef) {
      try {
        attachments = [await getDocumentPdf(organizationId, "invoice", claim.message.pdfRef.externalId, claim.message.pdfRef.number)];
      } catch {
        attachments = [];
      }
    }
    try {
      const res = await getEmailSender().send({
        organizationId,
        to: claim.message.to,
        subject: claim.message.subject,
        text: claim.message.text,
        templateName: claim.message.templateName,
        attachments,
      });
      emailStatus = res.delivered ? "SENT" : "LOGGED";
      detail = res.detail;
    } catch (err) {
      emailStatus = "LOGGED";
      detail = `E-Mail-Versand fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  await withOrg(organizationId, (tx) =>
    tx.dunningRun.create({
      data: {
        organizationId,
        documentId: claim.inv.id,
        level: claim.level.level,
        label: claim.level.label,
        feeCents: claim.amounts.feeCents,
        interestCents: claim.amounts.interestCents,
        openCents: claim.amounts.openBeforeCents,
        emailStatus,
        detail,
      },
    }),
  );

  return { ok: true, level: claim.level.level, message: `${claim.level.label} versendet (${emailStatus === "SENT" ? "zugestellt" : emailStatus === "LOGGED" ? "im Protokoll" : "ohne Empfänger"})` };
}

/** Candidate invoices for an org: finalized, unpaid, with a due date and rungs left. */
async function dueInvoiceIds(organizationId: string, policy: PolicyRow, now: Date): Promise<string[]> {
  const levels = [...policy.levels].sort((a, b) => a.level - b.level);
  const maxLevel = levels.at(-1)?.level ?? 0;
  if (maxLevel === 0) return [];
  return withOrg(organizationId, async (tx) => {
    const rows = await tx.document.findMany({
      where: {
        kind: "INVOICE",
        status: "FINALIZED",
        paymentStatus: { in: ["OPEN", "PARTIAL"] },
        dueDate: { not: null },
        dunningLevel: { lt: maxLevel },
        OR: [{ dunningPausedUntil: null }, { dunningPausedUntil: { lt: now } }],
      },
      select: { id: true, totalCents: true, paidCents: true, dueDate: true, dunningLevel: true, dunningPausedUntil: true },
      take: BATCH_PER_ORG,
    });
    return rows
      .filter((r) =>
        isDunningDue({ dueDate: r.dueDate, openCents: openCents(r.totalCents, r.paidCents), currentLevel: r.dunningLevel, maxLevel, pausedUntil: r.dunningPausedUntil, policy, now }),
      )
      .map((r) => r.id);
  });
}

/**
 * Sweep every organization with an active dunning policy and issue any due
 * Mahnungen. Returns how many were sent. Reads policies across tenants on the
 * base connection (a system operation, like the other ticker sweeps); each org
 * is then processed inside withOrg where RLS applies.
 */
export async function drainDueDunning(now: Date = new Date()): Promise<number> {
  const policies = (await prisma.dunningPolicy.findMany({
    where: { isActive: true },
    include: { levels: true },
  })) as unknown as PolicyRow[];

  let sent = 0;
  for (const policy of policies) {
    try {
      const ids = await dueInvoiceIds(policy.organizationId, policy, now);
      for (const id of ids) {
        const out = await issueForInvoice(policy.organizationId, id, policy, now, false);
        if (out.ok) sent++;
      }
    } catch (err) {
      console.error(`[dunning] sweep failed org=${policy.organizationId}`, err);
    }
  }
  return sent;
}

/** Manual „Jetzt mahnen" for a single invoice (server action). */
export async function dunInvoiceNow(organizationId: string, documentId: string, now: Date = new Date()): Promise<DunningOutcome> {
  const policy = (await withOrg(organizationId, (tx) =>
    tx.dunningPolicy.findFirst({ where: { isActive: true }, include: { levels: true } }),
  )) as unknown as PolicyRow | null;
  if (!policy) return { ok: false, message: "Keine Mahnrichtlinie konfiguriert" };
  return issueForInvoice(organizationId, documentId, { ...policy, organizationId }, now, true);
}
