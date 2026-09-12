"use server";

import { revalidatePath } from "next/cache";
import { scoped } from "@/lib/session";
import { getFreeFinanceClient } from "@/lib/freefinance";
import { getReferenceData } from "@/lib/freefinance/refdata";
import { postDocument } from "@/lib/freefinance/sync";
import { documentTotals, decimalToCents, type DiscountMode } from "@/lib/freefinance/totals";
import { FreeFinanceApiError } from "@/lib/freefinance/errors";
import type { ActionResult } from "@/app/(app)/settings/actions";

export interface OfferLineInput {
  productId?: string | null;
  type: "ITEM" | "TOTAL_DISCOUNT";
  name: string;
  itemNumber?: string | null;
  quantity: number;
  unit?: string | null;
  unitPriceCents: number;
  discountValue?: number | null;
  discountMode?: DiscountMode | null;
  account?: string | null;
  vatRate: number;
}

export interface OfferPayload {
  id?: string | null;
  kind: "OFFER" | "INVOICE";
  companyId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  currency: string;
  issueDate: string; // YYYY-MM-DD
  expirationDate?: string | null;
  docDiscountValue?: number | null;
  docDiscountMode?: DiscountMode | null;
  lines: OfferLineInput[];
}

function fail(e: unknown, fallback: string): ActionResult & Record<string, unknown> {
  if (e instanceof FreeFinanceApiError) return { ok: false, error: e.message, ffError: e.toDisplay() };
  return { ok: false, error: e instanceof Error ? e.message : fallback };
}

function computeAndPersistData(payload: OfferPayload) {
  const items = payload.lines
    .filter((l) => l.type === "ITEM")
    .map((l) => ({ quantity: l.quantity, unitPriceCents: l.unitPriceCents, discountValue: l.discountValue, discountMode: l.discountMode, vatRate: l.vatRate }));
  const docDiscount =
    payload.docDiscountValue != null && payload.docDiscountMode
      ? { value: payload.docDiscountValue, mode: payload.docDiscountMode }
      : null;
  const totals = documentTotals(items, docDiscount);
  return { totals, docDiscount };
}

/** Create or update a Document (DRAFT) with its lines. Kundeo-only, no API call. */
export async function saveOfferDraft(payload: OfferPayload): Promise<ActionResult & { id?: string }> {
  try {
    const { totals } = computeAndPersistData(payload);
    const itemTotals = totals.lines;
    let itemIndex = 0;

    const id = await scoped(async (db, organizationId) => {
      const base = {
        organizationId,
        kind: payload.kind,
        status: "DRAFT" as const,
        companyId: payload.companyId ?? null,
        contactId: payload.contactId ?? null,
        dealId: payload.dealId ?? null,
        currency: payload.currency,
        netCents: totals.netCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        discountValue: payload.docDiscountValue ?? null,
        discountMode: payload.docDiscountMode ?? null,
        issueDate: new Date(payload.issueDate),
        expirationDate: payload.expirationDate ? new Date(payload.expirationDate) : null,
      };

      const doc = payload.id
        ? await db.document.update({ where: { id: payload.id }, data: base })
        : await db.document.create({ data: base });

      if (payload.id) await db.documentLine.deleteMany({ where: { documentId: doc.id } });

      let position = 0;
      for (const l of payload.lines) {
        const t = l.type === "ITEM" ? itemTotals[itemIndex++] : null;
        await db.documentLine.create({
          data: {
            documentId: doc.id,
            position: position++,
            type: l.type,
            productId: l.productId ?? null,
            name: l.name,
            itemNumber: l.itemNumber ?? null,
            quantity: l.quantity,
            unit: l.unit ?? null,
            unitPriceCents: l.unitPriceCents,
            discountValue: l.discountValue ?? null,
            discountMode: l.discountMode ?? null,
            account: l.account ?? null,
            vatRate: l.vatRate,
            netCents: t?.netCents ?? 0,
            taxCents: t?.taxCents ?? 0,
            totalCents: t?.totalCents ?? 0,
          },
        });
      }
      return doc.id;
    });

    revalidatePath("/offers");
    return { ok: true, id };
  } catch (e) {
    return fail(e, "Angebot konnte nicht gespeichert werden.");
  }
}

/** Persist the draft, then post to FreeFinance with finalize:true (number + PDF). */
export async function finalizeOffer(
  payload: OfferPayload,
  opts: { eInvoice?: string } = {},
): Promise<ActionResult & { id?: string; number?: string }> {
  try {
    const saved = await saveOfferDraft(payload);
    if (!saved.ok || !saved.id) return saved;
    const orgId = await scoped(async (_db, organizationId) => organizationId);
    const result = await postDocument(orgId, saved.id, { finalize: true, eInvoice: opts.eInvoice });
    revalidatePath("/offers");
    revalidatePath(`/offers/${saved.id}`);
    return { ok: true, id: saved.id, number: result.number };
  } catch (e) {
    return fail(e, "Der Beleg wurde nicht übertragen.");
  }
}

export async function deleteOffer(id: string): Promise<ActionResult> {
  try {
    await scoped(async (db) => {
      await db.externalRef.deleteMany({ where: { entityType: "offer", entityId: id } });
      await db.document.delete({ where: { id } });
    });
    revalidatePath("/offers");
    return { ok: true };
  } catch (e) {
    return fail(e, "Angebot konnte nicht gelöscht werden.");
  }
}

export interface CatalogueItem {
  externalId: string;
  name: string;
  itemNumber: string;
  unitPriceCents: number;
  unit: string;
  vatRate: number;
}

/** Search the FreeFinance item catalogue for the offer builder's picker. */
export async function searchCatalogue(query: string): Promise<{ ok: boolean; items: CatalogueItem[]; error?: string }> {
  try {
    const orgId = await scoped(async (_db, organizationId) => organizationId);
    const client = await getFreeFinanceClient(orgId);
    const list = await client.listItems({ search: query || undefined, limit: 25 });
    const items: CatalogueItem[] = (list.content ?? []).map((i) => ({
      externalId: i.id,
      name: i.name,
      itemNumber: i.number ?? "",
      unitPriceCents: decimalToCents(i.selling_price ?? 0),
      unit: i.unit_of_measure ?? "",
      vatRate: i.taxes?.tax_1?.tax_class_entry?.tax_rate_value ?? 20,
    }));
    return { ok: true, items };
  } catch (e) {
    return { ok: false, items: [], error: e instanceof Error ? e.message : "Katalog konnte nicht geladen werden." };
  }
}

/**
 * Import a FreeFinance-only catalogue item as a Kundeo Product (+ ExternalRef),
 * so a picked catalogue line has a productId immediately (decision 5/6).
 */
export async function importCatalogueItem(item: CatalogueItem): Promise<{ ok: boolean; productId?: string; error?: string }> {
  try {
    const productId = await scoped(async (db, organizationId) => {
      // Reuse an existing mapping if this item was imported before.
      const existing = await db.externalRef.findFirst({ where: { provider: "freefinance", entityType: "item", externalId: item.externalId } });
      if (existing) return existing.entityId;
      const product = await db.product.create({
        data: {
          organizationId,
          name: item.name,
          sku: item.itemNumber || null,
          unitPriceCents: item.unitPriceCents,
          currency: "EUR",
          vatRate: item.vatRate,
          unit: item.unit || null,
          active: true,
        },
      });
      await db.externalRef.create({
        data: { organizationId, provider: "freefinance", entityType: "item", entityId: product.id, externalId: item.externalId, externalNumber: item.itemNumber || null },
      });
      return product.id;
    });
    revalidatePath("/products");
    return { ok: true, productId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Artikel konnte nicht übernommen werden." };
  }
}
