"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@kundeo/auth";
import { prisma } from "@kundeo/db";
import { getSession, ensureActiveOrgId, scoped } from "@/lib/session";

export type ActionResult = { ok: boolean; error?: string };

function message(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

/** Reads the organization's metadata JSON (stored as a string column). */
async function readMetadata(orgId: string): Promise<Record<string, unknown>> {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { metadata: true } });
  if (!org?.metadata) return {};
  try {
    return JSON.parse(org.metadata) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export interface OrgSettingsInput {
  name: string;
  slug: string;
  currency: string;
  country: string;
  vatId: string;
  timezone: string;
}

/** Persists org name/slug (Better Auth) plus the DACH fields in metadata JSON. */
export async function saveOrganization(input: OrgSettingsInput): Promise<ActionResult> {
  const orgId = await ensureActiveOrgId();
  if (!orgId) return { ok: false, error: "Keine aktive Organisation" };
  try {
    const meta = await readMetadata(orgId);
    const metadata = {
      ...meta,
      currency: input.currency,
      country: input.country,
      vatId: input.vatId,
      timezone: input.timezone,
    };
    await auth.api.updateOrganization({
      body: { organizationId: orgId, data: { name: input.name.trim(), slug: input.slug.trim(), metadata } },
      headers: await headers(),
    });
    revalidatePath("/settings");
    revalidatePath("/", "layout"); // org name shown in the shell
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e, "Organisation konnte nicht gespeichert werden.") };
  }
}

/** Persists the current user's notification preferences under metadata.notifications[userId]. */
export async function savePreferences(prefs: Record<string, unknown>): Promise<ActionResult> {
  const [orgId, session] = await Promise.all([ensureActiveOrgId(), getSession()]);
  if (!orgId || !session) return { ok: false, error: "Nicht angemeldet" };
  try {
    const meta = await readMetadata(orgId);
    const notifications = { ...((meta.notifications as Record<string, unknown>) ?? {}), [session.user.id]: prefs };
    await auth.api.updateOrganization({
      body: { organizationId: orgId, data: { metadata: { ...meta, notifications } } },
      headers: await headers(),
    });
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e, "Einstellungen konnten nicht gespeichert werden.") };
  }
}

export async function addStage(): Promise<ActionResult> {
  try {
    await scoped(async (db) => {
      const pipeline = await db.pipeline.findFirst({ where: { isDefault: true }, orderBy: { createdAt: "asc" } });
      if (!pipeline) throw new Error("Keine Standard-Pipeline vorhanden.");
      const max = await db.stage.aggregate({ where: { pipelineId: pipeline.id }, _max: { order: true } });
      await db.stage.create({
        data: { pipelineId: pipeline.id, name: "Neue Phase", order: (max._max.order ?? -1) + 1, probability: 0 },
      });
    });
    revalidatePath("/settings");
    revalidatePath("/deals");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e, "Phase konnte nicht angelegt werden.") };
  }
}

export async function saveStages(stages: { id: string; name: string; probability: number }[]): Promise<ActionResult> {
  try {
    await scoped(async (db) => {
      for (const s of stages) {
        await db.stage.update({
          where: { id: s.id },
          data: {
            name: s.name.trim() || "Phase",
            probability: Math.max(0, Math.min(100, Math.round(s.probability))),
          },
        });
      }
    });
    revalidatePath("/settings");
    revalidatePath("/deals");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e, "Phasen konnten nicht gespeichert werden.") };
  }
}

export async function removeStage(id: string): Promise<ActionResult> {
  try {
    await scoped(async (db) => {
      const deals = await db.deal.count({ where: { stageId: id } });
      if (deals > 0) throw new Error("Phase enthält Deals und kann nicht entfernt werden.");
      await db.stage.delete({ where: { id } });
    });
    revalidatePath("/settings");
    revalidatePath("/deals");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e, "Phase konnte nicht entfernt werden.") };
  }
}
