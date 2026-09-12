import "server-only";
import { withOrg } from "@kundeo/db";
import { syncCompany, postDocument } from "./sync";
import { lineTotals } from "./totals";

/**
 * Processors for FreeFinanceSyncJob rows. The ticker calls these outside any
 * transaction; each does its own scoped reads/writes and the network I/O. A
 * thrown error tells the ticker to retry with backoff (or fail after
 * maxAttempts). Kept separate from the automation runner so the network layer
 * never touches a run's interactive transaction.
 */

interface JobRow {
  id: string;
  kind: "CUSTOMER_SYNC" | "INVOICE_CREATE";
  companyId: string | null;
  dealId: string | null;
  config: unknown;
}

function cfg(config: unknown): Record<string, unknown> {
  return config && typeof config === "object" ? (config as Record<string, unknown>) : {};
}

/**
 * Build a DRAFT invoice Document from a deal and return its id. `lineSource`
 * "offer" copies the deal's most recent finalized offer; "deal" makes a single
 * line from the deal amount using the configured income account and VAT rate.
 */
async function createInvoiceForDeal(
  organizationId: string,
  dealId: string,
  config: Record<string, unknown>,
): Promise<string> {
  const lineSource = String(config.lineSource ?? "deal");
  const account = typeof config.account === "string" ? config.account : undefined;
  const vatRate = Number(config.vatRate ?? 20) || 0;

  return withOrg(organizationId, async (tx) => {
    const deal = await tx.deal.findUnique({ where: { id: dealId } });
    if (!deal) throw new Error("Deal nicht gefunden");

    if (lineSource === "offer") {
      const offer = await tx.document.findFirst({
        where: { kind: "OFFER", status: "FINALIZED", dealId },
        orderBy: { createdAt: "desc" },
        include: { lines: { orderBy: { position: "asc" } } },
      });
      if (!offer) throw new Error("Kein angenommenes Angebot für den Deal gefunden");
      const invoice = await tx.document.create({
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
      return invoice.id;
    }

    // lineSource === "deal": one ad-hoc line carrying the deal amount.
    const totals = lineTotals({ quantity: 1, unitPriceCents: deal.amountCents, vatRate });
    const invoice = await tx.document.create({
      data: {
        organizationId,
        kind: "INVOICE",
        status: "DRAFT",
        companyId: deal.companyId,
        contactId: deal.contactId,
        dealId: deal.id,
        currency: deal.currency,
        netCents: totals.netCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        issueDate: new Date(),
        lines: {
          create: [
            {
              position: 1,
              type: "ITEM",
              name: deal.title || "Produkt für den Deal-Betrag",
              quantity: 1,
              unitPriceCents: deal.amountCents,
              account: account ?? null,
              vatRate,
              netCents: totals.netCents,
              taxCents: totals.taxCents,
              totalCents: totals.totalCents,
            },
          ],
        },
      },
    });
    return invoice.id;
  });
}

/** Run one job. Returns a plain-German outcome; throws to trigger a retry. */
export async function processFreeFinanceJob(organizationId: string, job: JobRow): Promise<{ message: string; documentId?: string }> {
  if (job.kind === "CUSTOMER_SYNC") {
    if (!job.companyId) throw new Error("Keine Firma für die Kundensynchronisation");
    const r = await syncCompany(organizationId, job.companyId);
    return { message: r.number ? `Kunde synchronisiert · ${r.number}` : "Kunde synchronisiert" };
  }

  // INVOICE_CREATE
  if (!job.dealId) throw new Error("Kein Deal für die Rechnungserstellung");
  const config = cfg(job.config);
  const documentId = await createInvoiceForDeal(organizationId, job.dealId, config);
  const finalize = config.finalize === true;
  const result = await postDocument(organizationId, documentId, { finalize });
  const message =
    result.status === "FINALIZED"
      ? `Rechnung erstellt · ${result.number ?? ""}`.trim()
      : "Rechnung als Entwurf in FreeFinance angelegt";
  return { message, documentId };
}
