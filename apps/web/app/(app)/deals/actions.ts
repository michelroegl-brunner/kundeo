"use server";

import { revalidatePath } from "next/cache";
import { scoped } from "@/lib/session";

/**
 * Moves a deal into another stage of its pipeline. Runs tenant-scoped (RLS), so
 * both the deal and the target stage must belong to the caller's organization —
 * an out-of-org stageId resolves to null and is rejected.
 */
export async function moveDeal(dealId: string, stageId: string): Promise<void> {
  await scoped(async (db) => {
    const stage = await db.stage.findFirst({ where: { id: stageId }, select: { id: true } });
    if (!stage) throw new Error("Unbekannte Phase");
    await db.deal.update({ where: { id: dealId }, data: { stageId } });
  });
  revalidatePath("/deals");
}
