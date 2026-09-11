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
