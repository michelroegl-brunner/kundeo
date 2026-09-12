"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { scoped } from "@/lib/session";
import { syncProduct as syncProductToFf } from "@/lib/freefinance/sync";
import { FreeFinanceApiError } from "@/lib/freefinance/errors";
import type { ActionResult } from "@/app/(app)/settings/actions";

function clean(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : null;
}

/** Parse a German or plain price string (e.g. "1.234,50" / "1234.50") to cents. */
function priceToCents(v: FormDataEntryValue | null): number {
  const raw = typeof v === "string" ? v.trim() : "";
  if (!raw) return 0;
  const normalized = raw.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized.includes(".") ? normalized : raw.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function productInput(formData: FormData) {
  const vat = Number(clean(formData.get("vatRate")) ?? "20");
  return {
    name: clean(formData.get("name")) ?? "",
    sku: clean(formData.get("sku")),
    description: clean(formData.get("description")),
    unitPriceCents: priceToCents(formData.get("price")),
    currency: clean(formData.get("currency")) ?? "EUR",
    vatRate: Number.isFinite(vat) ? vat : 20,
    unit: clean(formData.get("unit")),
    account: clean(formData.get("account")),
    active: formData.get("active") === "on" || formData.get("active") === "true",
  };
}

export async function createProduct(formData: FormData) {
  await scoped((db, organizationId) => db.product.create({ data: { ...productInput(formData), organizationId } }));
  revalidatePath("/products");
}

export async function updateProduct(id: string, formData: FormData) {
  await scoped((db) => db.product.update({ where: { id }, data: productInput(formData) }));
  revalidatePath("/products");
}

export async function deleteProduct(id: string) {
  await scoped(async (db) => {
    await db.externalRef.deleteMany({ where: { entityType: "item", entityId: id } });
    await db.product.delete({ where: { id } });
  });
  revalidatePath("/products");
  redirect("/products");
}

function fail(e: unknown, fallback: string): ActionResult & Record<string, unknown> {
  if (e instanceof FreeFinanceApiError) return { ok: false, error: e.message, ffError: e.toDisplay() };
  return { ok: false, error: e instanceof Error ? e.message : fallback };
}

/** Push one product to FreeFinance (create/update the item). */
export async function syncProduct(id: string): Promise<ActionResult> {
  try {
    const orgId = await scoped(async (_db, organizationId) => organizationId);
    await syncProductToFf(orgId, id);
    revalidatePath("/products");
    return { ok: true };
  } catch (e) {
    return fail(e, "Produkt konnte nicht übertragen werden.");
  }
}

/** Push every not-yet-synced product to FreeFinance. */
export async function syncCatalog(): Promise<ActionResult & { synced?: number; failed?: number }> {
  try {
    const { orgId, ids } = await scoped(async (db, organizationId) => {
      const products = await db.product.findMany({ where: { active: true }, select: { id: true } });
      return { orgId: organizationId, ids: products.map((p) => p.id) };
    });
    let synced = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        await syncProductToFf(orgId, id);
        synced++;
      } catch {
        failed++;
      }
    }
    revalidatePath("/products");
    return { ok: true, synced, failed };
  } catch (e) {
    return fail(e, "Katalog konnte nicht synchronisiert werden.");
  }
}
