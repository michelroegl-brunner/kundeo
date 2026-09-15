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

export async function addStage(pipelineId?: string): Promise<ActionResult> {
  try {
    await scoped(async (db) => {
      // Target the given pipeline (verified in-org by RLS) or the default one.
      const pipeline = pipelineId
        ? await db.pipeline.findFirst({ where: { id: pipelineId } })
        : await db.pipeline.findFirst({ where: { isDefault: true }, orderBy: { createdAt: "asc" } });
      if (!pipeline) throw new Error("Keine Pipeline vorhanden.");
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

/** Creates a pipeline with one starter stage; the org's first pipeline becomes the default. */
export async function createPipeline(name: string): Promise<ActionResult> {
  try {
    await scoped(async (db, organizationId) => {
      // RLS scopes this to the org, so an empty org has no default pipeline —
      // promote the first one so the deals board is reachable right away.
      const isFirst = (await db.pipeline.count()) === 0;
      const pipeline = await db.pipeline.create({
        data: { organizationId, name: name.trim() || "Neue Pipeline", isDefault: isFirst },
      });
      await db.stage.create({ data: { pipelineId: pipeline.id, name: "Neue Phase", order: 0, probability: 0 } });
    });
    revalidatePath("/settings");
    revalidatePath("/deals");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e, "Pipeline konnte nicht angelegt werden.") };
  }
}

export async function renamePipeline(id: string, name: string): Promise<ActionResult> {
  try {
    await scoped((db) => db.pipeline.update({ where: { id }, data: { name: name.trim() || "Pipeline" } }));
    revalidatePath("/settings");
    revalidatePath("/deals");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e, "Pipeline konnte nicht umbenannt werden.") };
  }
}

/** Makes one pipeline the org default; clears the flag on the others. */
export async function setDefaultPipeline(id: string): Promise<ActionResult> {
  try {
    await scoped(async (db) => {
      const target = await db.pipeline.findFirst({ where: { id }, select: { id: true } });
      if (!target) throw new Error("Pipeline nicht gefunden.");
      await db.pipeline.updateMany({ data: { isDefault: false } }); // RLS scopes to the org
      await db.pipeline.update({ where: { id }, data: { isDefault: true } });
    });
    revalidatePath("/settings");
    revalidatePath("/deals");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e, "Standard-Pipeline konnte nicht gesetzt werden.") };
  }
}

/** Deletes a pipeline. Refuses the last one or any pipeline that still holds deals. */
export async function deletePipeline(id: string): Promise<ActionResult> {
  try {
    await scoped(async (db) => {
      const count = await db.pipeline.count();
      if (count <= 1) throw new Error("Die letzte Pipeline kann nicht gelöscht werden.");
      const target = await db.pipeline.findFirst({ where: { id }, select: { id: true, isDefault: true } });
      if (!target) throw new Error("Pipeline nicht gefunden.");
      const deals = await db.deal.count({ where: { pipelineId: id } });
      if (deals > 0) throw new Error("Pipeline enthält Deals und kann nicht gelöscht werden.");
      await db.pipeline.delete({ where: { id } }); // stages cascade
      if (target.isDefault) {
        const next = await db.pipeline.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
        if (next) await db.pipeline.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
    revalidatePath("/settings");
    revalidatePath("/deals");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e, "Pipeline konnte nicht gelöscht werden.") };
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
