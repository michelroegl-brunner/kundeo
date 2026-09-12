"use server";

import { revalidatePath } from "next/cache";
import { scoped } from "@/lib/session";
import { getFreeFinanceClient } from "@/lib/freefinance";
import { postDocument } from "@/lib/freefinance/sync";
import { getDocumentPdf } from "@/lib/freefinance/documents";
import { getEmailSender } from "@/lib/email";
import { FreeFinanceApiError } from "@/lib/freefinance/errors";
import type { ActionResult } from "@/app/(app)/settings/actions";

function fail(e: unknown, fallback: string): ActionResult & Record<string, unknown> {
  if (e instanceof FreeFinanceApiError) return { ok: false, error: e.message, ffError: e.toDisplay() };
  return { ok: false, error: e instanceof Error ? e.message : fallback };
}

/** Cancel a finalized document in FreeFinance and mark it CANCELLED in Kundeo. */
export async function cancelDocument(documentId: string): Promise<ActionResult> {
  try {
    const { orgId, kind, externalId } = await scoped(async (db, organizationId) => {
      const doc = await db.document.findUnique({ where: { id: documentId } });
      if (!doc) throw new Error("Beleg nicht gefunden");
      const entityType = doc.kind === "OFFER" ? "offer" : "invoice";
      const ref = await db.externalRef.findFirst({ where: { provider: "freefinance", entityType, entityId: documentId } });
      return { orgId: organizationId, kind: entityType as "offer" | "invoice", externalId: ref?.externalId };
    });
    if (externalId) {
      const client = await getFreeFinanceClient(orgId);
      await client.cancel(kind, externalId);
    }
    await scoped((db) => db.document.update({ where: { id: documentId }, data: { status: "CANCELLED" } }));
    revalidatePath(`/${kind === "offer" ? "offers" : "invoices"}/${documentId}`);
    return { ok: true };
  } catch (e) {
    return fail(e, "Beleg konnte nicht storniert werden.");
  }
}

/** Create an invoice from an accepted offer (copy lines), optionally finalizing. */
export async function createInvoiceFromOffer(
  offerId: string,
  opts: { finalize?: boolean; eInvoice?: string } = {},
): Promise<ActionResult & { id?: string; number?: string }> {
  try {
    const { orgId, invoiceId } = await scoped(async (db, organizationId) => {
      const offer = await db.document.findUnique({ where: { id: offerId }, include: { lines: { orderBy: { position: "asc" } } } });
      if (!offer) throw new Error("Angebot nicht gefunden");
      const invoice = await db.document.create({
        data: {
          organizationId,
          kind: "INVOICE",
          status: "DRAFT",
          companyId: offer.companyId,
          contactId: offer.contactId,
          dealId: offer.dealId,
          sourceOfferId: offer.id,
          currency: offer.currency,
          netCents: offer.netCents,
          taxCents: offer.taxCents,
          totalCents: offer.totalCents,
          discountValue: offer.discountValue,
          discountMode: offer.discountMode,
          issueDate: new Date(),
          eInvoice: offer.eInvoice,
          lines: {
            create: offer.lines.map((l) => ({
              position: l.position,
              type: l.type,
              productId: l.productId,
              name: l.name,
              itemNumber: l.itemNumber,
              quantity: l.quantity,
              unit: l.unit,
              unitPriceCents: l.unitPriceCents,
              discountValue: l.discountValue,
              discountMode: l.discountMode,
              account: l.account,
              vatRate: l.vatRate,
              netCents: l.netCents,
              taxCents: l.taxCents,
              totalCents: l.totalCents,
            })),
          },
        },
      });
      return { orgId: organizationId, invoiceId: invoice.id };
    });

    let number: string | undefined;
    if (opts.finalize) {
      const result = await postDocument(orgId, invoiceId, { finalize: true, eInvoice: opts.eInvoice });
      number = result.number;
    }
    revalidatePath("/invoices");
    return { ok: true, id: invoiceId, number };
  } catch (e) {
    return fail(e, "Rechnung konnte nicht erstellt werden.");
  }
}

/** Fetch the finalized PDF and send it via the email module with a template. */
export async function sendDocument(
  documentId: string,
  input: { templateId?: string; to: string },
): Promise<ActionResult> {
  try {
    if (!input.to.trim()) return { ok: false, error: "Empfänger fehlt." };
    const { orgId, kind, externalId, number, template } = await scoped(async (db, organizationId) => {
      const doc = await db.document.findUnique({ where: { id: documentId } });
      if (!doc) throw new Error("Beleg nicht gefunden");
      const entityType = doc.kind === "OFFER" ? "offer" : "invoice";
      const ref = await db.externalRef.findFirst({ where: { provider: "freefinance", entityType, entityId: documentId } });
      const template = input.templateId ? await db.emailTemplate.findUnique({ where: { id: input.templateId } }) : null;
      return { orgId: organizationId, kind: entityType as "offer" | "invoice", externalId: ref?.externalId, number: doc.externalNumber, template };
    });
    if (!externalId) return { ok: false, error: "Der Beleg wurde noch nicht an FreeFinance übertragen." };

    const attachment = await getDocumentPdf(orgId, kind, externalId, number);
    const subject = template?.subject ?? `${kind === "offer" ? "Angebot" : "Rechnung"} ${number ?? ""}`.trim();
    const text = template?.body ?? "Im Anhang finden Sie Ihren Beleg.";
    await getEmailSender().send({
      organizationId: orgId,
      to: input.to.trim(),
      subject,
      text,
      templateName: template?.name,
      attachments: [attachment],
    });
    return { ok: true };
  } catch (e) {
    return fail(e, "Beleg konnte nicht gesendet werden.");
  }
}
