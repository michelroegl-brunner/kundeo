"use server";

import { revalidatePath } from "next/cache";
import { scoped } from "@/lib/session";
import { emitEvent } from "@/lib/automations/events";
import { dealAmountCents, parseMoneyToCents, type DealValueMode, type EffortPeriod } from "@/lib/deal-value";

/**
 * Moves a deal into another stage of its pipeline. Runs tenant-scoped (RLS), so
 * both the deal and the target stage must belong to the caller's organization —
 * an out-of-org stageId resolves to null and is rejected.
 */
export async function moveDeal(dealId: string, stageId: string): Promise<void> {
  const stageName = await scoped(async (db) => {
    const stage = await db.stage.findFirst({ where: { id: stageId }, select: { id: true, name: true } });
    if (!stage) throw new Error("Unbekannte Phase");
    await db.deal.update({ where: { id: dealId }, data: { stageId } });
    return stage.name;
  });
  await emitEvent("deal.stage", { type: "Deal", id: dealId }, { stage: stageName });
  revalidatePath("/deals");
}

function clean(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : null;
}

function toNumber(v: FormDataEntryValue | null): number | null {
  const s = clean(v);
  if (s == null) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Reads the shared deal fields from a form and resolves the effective
 * `amountCents` from the value mode (fixed amount, or effort × rate × period).
 */
function dealInput(formData: FormData) {
  const valueMode: DealValueMode = clean(formData.get("valueMode")) === "EFFORT" ? "EFFORT" : "FIXED";
  const hoursPerWeek = valueMode === "EFFORT" ? toNumber(formData.get("hoursPerWeek")) : null;
  const hourlyRateCents = valueMode === "EFFORT" ? parseMoneyToCents(clean(formData.get("hourlyRate")) ?? undefined) : null;
  const rawPeriod = clean(formData.get("effortPeriod"));
  const effortPeriod: EffortPeriod | null =
    valueMode === "EFFORT" && (rawPeriod === "WEEKLY" || rawPeriod === "MONTHLY" || rawPeriod === "ANNUAL")
      ? rawPeriod
      : valueMode === "EFFORT"
        ? "MONTHLY"
        : null;
  const fixedCents = parseMoneyToCents(clean(formData.get("amount")) ?? undefined) ?? 0;

  const amountCents = dealAmountCents({ valueMode, amountCents: fixedCents, hoursPerWeek, hourlyRateCents, effortPeriod });

  return {
    title: clean(formData.get("title")) ?? "",
    currency: clean(formData.get("currency")) === "CHF" ? "CHF" : "EUR",
    valueMode,
    hoursPerWeek,
    hourlyRateCents,
    effortPeriod,
    amountCents,
    companyId: clean(formData.get("companyId")),
    contactId: clean(formData.get("contactId")),
    ownerId: clean(formData.get("ownerId")),
    expectedCloseAt: clean(formData.get("expectedCloseAt")) ? new Date(clean(formData.get("expectedCloseAt"))!) : null,
  };
}

/**
 * Creates a deal. The pipeline comes from the form when given, else the org's
 * default; the stage from the form, else the pipeline's first (lowest order).
 * Fires `deal.created` so automations can react.
 */
export async function createDeal(formData: FormData): Promise<void> {
  const input = dealInput(formData);
  if (!input.title) throw new Error("Titel fehlt");

  const dealId = await scoped(async (db, organizationId) => {
    const pipelineId = clean(formData.get("pipelineId"));
    const pipeline = pipelineId
      ? await db.pipeline.findFirst({ where: { id: pipelineId }, include: { stages: { orderBy: { order: "asc" }, take: 1 } } })
      : await db.pipeline.findFirst({
          orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
          include: { stages: { orderBy: { order: "asc" }, take: 1 } },
        });
    const firstStage = pipeline?.stages[0];
    if (!pipeline || !firstStage) throw new Error("Keine Pipeline mit Phasen vorhanden");

    const chosenStage = clean(formData.get("stageId"));
    const stageId = chosenStage
      ? ((await db.stage.findFirst({ where: { id: chosenStage, pipelineId: pipeline.id }, select: { id: true } }))?.id ??
        firstStage.id)
      : firstStage.id;

    const deal = await db.deal.create({
      data: { ...input, organizationId, pipelineId: pipeline.id, stageId },
      select: { id: true },
    });
    return deal.id;
  });

  await emitEvent("deal.created", { type: "Deal", id: dealId });
  revalidatePath("/deals");
  revalidatePath("/dashboard");
}

/** Closes a deal as won (or lost) and fires the matching trigger. */
async function closeDeal(dealId: string, status: "WON" | "LOST"): Promise<void> {
  await scoped(async (db) => {
    const deal = await db.deal.findFirst({ where: { id: dealId }, select: { id: true } });
    if (!deal) throw new Error("Unbekannter Deal");
    await db.deal.update({ where: { id: dealId }, data: { status, closedAt: new Date() } });
  });
  await emitEvent(status === "WON" ? "deal.won" : "deal.lost", { type: "Deal", id: dealId });
  revalidatePath("/deals");
  revalidatePath("/dashboard");
}

export async function winDeal(dealId: string): Promise<void> {
  await closeDeal(dealId, "WON");
}

export async function loseDeal(dealId: string): Promise<void> {
  await closeDeal(dealId, "LOST");
}
