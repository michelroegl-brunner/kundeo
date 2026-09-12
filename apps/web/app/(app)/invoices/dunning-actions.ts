"use server";

import { revalidatePath } from "next/cache";
import { ensureActiveOrgId, requireOrgRole, scoped } from "@/lib/session";
import { dunInvoiceNow } from "@/lib/dunning/sweep";
import type { ActionResult } from "@/app/(app)/settings/actions";

/** Manually issue the next Mahnstufe for one invoice („Jetzt mahnen"). */
export async function dunInvoiceAction(documentId: string): Promise<ActionResult & { message?: string }> {
  try {
    await requireOrgRole("member");
    const orgId = await ensureActiveOrgId();
    if (!orgId) return { ok: false, error: "Keine aktive Organisation." };
    const out = await dunInvoiceNow(orgId, documentId);
    revalidatePath(`/invoices/${documentId}`);
    revalidatePath("/invoices");
    if (!out.ok) return { ok: false, error: out.message };
    return { ok: true, message: out.message };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Mahnung konnte nicht erstellt werden." };
  }
}

/** Pause the dunning ladder until a date, or resume it (`untilISO` = null). */
export async function setDunningPauseAction(documentId: string, untilISO: string | null): Promise<ActionResult> {
  try {
    await requireOrgRole("member");
    const until = untilISO ? new Date(untilISO) : null;
    if (untilISO && Number.isNaN(until!.getTime())) return { ok: false, error: "Ungültiges Datum." };
    await scoped((db) =>
      db.document.updateMany({
        where: { id: documentId, kind: "INVOICE" },
        data: { dunningPausedUntil: until },
      }),
    );
    revalidatePath(`/invoices/${documentId}`);
    revalidatePath("/invoices");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Mahnlauf konnte nicht geändert werden." };
  }
}
