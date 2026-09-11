"use server";

import { revalidatePath } from "next/cache";
import { getSession, scoped } from "@/lib/session";
import { emitEvent } from "@/lib/automations/events";

export type ActivityKind = "NOTE" | "CALL" | "EMAIL" | "MEETING" | "TASK";
const KINDS: ActivityKind[] = ["NOTE", "CALL", "EMAIL", "MEETING", "TASK"];

/**
 * Logs an activity against a contact. Tenant-scoped (RLS): the contact must
 * belong to the caller's organization. The author is the current user.
 */
export async function addActivity(contactId: string, type: ActivityKind, subject: string): Promise<void> {
  const trimmed = subject.trim();
  if (!trimmed) return;
  if (!KINDS.includes(type)) throw new Error("Ungültiger Aktivitätstyp");

  const session = await getSession();
  const activity = await scoped(async (db, organizationId) => {
    const contact = await db.contact.findFirst({ where: { id: contactId }, select: { id: true } });
    if (!contact) throw new Error("Kontakt nicht gefunden");
    return db.activity.create({
      data: { organizationId, type, subject: trimmed, contactId, authorId: session?.user.id ?? null },
      select: { id: true },
    });
  });
  if (type === "TASK") await emitEvent("task.created", { type: "Task", id: activity.id });
  revalidatePath(`/contacts/${contactId}`);
}

/**
 * Adds a tag to a contact, creating the org's tag on first use. Fires
 * `contact.tagged` (with the tag name) only when a genuinely new link is made,
 * so re-adding an existing tag never re-triggers automations.
 */
export async function addContactTag(contactId: string, name: string): Promise<void> {
  const tagName = name.trim();
  if (!tagName) return;

  const added = await scoped(async (db, organizationId) => {
    const contact = await db.contact.findFirst({ where: { id: contactId }, select: { id: true } });
    if (!contact) throw new Error("Kontakt nicht gefunden");
    const tag = await db.tag.upsert({
      where: { organizationId_name: { organizationId, name: tagName } },
      update: {},
      create: { organizationId, name: tagName },
      select: { id: true },
    });
    const existing = await db.contactTag.findUnique({
      where: { contactId_tagId: { contactId, tagId: tag.id } },
      select: { contactId: true },
    });
    if (existing) return false;
    await db.contactTag.create({ data: { contactId, tagId: tag.id } });
    return true;
  });

  if (added) await emitEvent("contact.tagged", { type: "Contact", id: contactId }, { tag: tagName });
  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/contacts");
}

/** Removes a tag from a contact. Idempotent; tenant-scoped by RLS. */
export async function removeContactTag(contactId: string, tagId: string): Promise<void> {
  await scoped((db) => db.contactTag.deleteMany({ where: { contactId, tagId } }));
  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/contacts");
}
