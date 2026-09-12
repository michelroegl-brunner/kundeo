"use server";

import { revalidatePath } from "next/cache";
import { ensureActiveOrgId } from "@/lib/session";
import { syncCompany } from "@/lib/freefinance/sync";
import { FreeFinanceApiError } from "@/lib/freefinance/errors";
import type { ActionResult } from "@/app/(app)/settings/actions";

/** Create or update this company as a FreeFinance customer (idempotent). */
export async function syncCompanyToFreeFinance(companyId: string): Promise<ActionResult & { number?: string }> {
  try {
    const orgId = await ensureActiveOrgId();
    if (!orgId) return { ok: false, error: "Keine aktive Organisation." };
    const result = await syncCompany(orgId, companyId);
    revalidatePath(`/companies/${companyId}`);
    return { ok: true, number: result.number };
  } catch (e) {
    if (e instanceof FreeFinanceApiError) return { ok: false, error: e.message };
    return { ok: false, error: e instanceof Error ? e.message : "Kunde konnte nicht übertragen werden." };
  }
}
