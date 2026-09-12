"use server";

import { revalidatePath } from "next/cache";
import { requireOrgRole, scoped } from "@/lib/session";
import type { ActionResult } from "@/app/(app)/settings/actions";

export interface DunningLevelInput {
  level: number;
  label: string;
  feeCents: number;
  interestBps: number;
  emailTemplateId: string | null;
}

export interface DunningPolicyInput {
  isActive: boolean;
  graceDays: number;
  intervalDays: number;
  levels: DunningLevelInput[];
}

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, Math.round(v)));
}

/**
 * Save the organization's Mahnwesen ladder. Upserts the single policy and
 * replaces its levels wholesale (the ladder is small and edited as a unit).
 * Admin-only; written through `scoped()` so RLS applies.
 */
export async function saveDunningPolicy(input: DunningPolicyInput): Promise<ActionResult> {
  try {
    await requireOrgRole("admin");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Keine Berechtigung für diese Aktion." };
  }

  const levels = input.levels
    .filter((l) => l.label.trim())
    .map((l, i) => ({
      level: i + 1,
      label: l.label.trim().slice(0, 80),
      feeCents: clampInt(l.feeCents, 0, 1_000_000),
      interestBps: clampInt(l.interestBps, 0, 100_000),
      emailTemplateId: l.emailTemplateId?.trim() || null,
    }));

  if (!levels.length) return { ok: false, error: "Mindestens eine Mahnstufe ist erforderlich." };

  const graceDays = clampInt(input.graceDays, 0, 365);
  const intervalDays = clampInt(input.intervalDays, 1, 365);

  try {
    await scoped(async (db, organizationId) => {
      const existing = await db.dunningPolicy.findFirst({ where: { organizationId } });
      const policy = existing
        ? await db.dunningPolicy.update({
            where: { id: existing.id },
            data: { isActive: input.isActive, graceDays, intervalDays },
          })
        : await db.dunningPolicy.create({
            data: { organizationId, isActive: input.isActive, graceDays, intervalDays },
          });
      await db.dunningLevel.deleteMany({ where: { policyId: policy.id } });
      await db.dunningLevel.createMany({ data: levels.map((l) => ({ ...l, policyId: policy.id })) });
    });
    revalidatePath("/settings");
    revalidatePath("/invoices");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Mahnrichtlinie konnte nicht gespeichert werden." };
  }
}
