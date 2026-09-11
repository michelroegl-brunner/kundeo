"use server";

import { revalidatePath } from "next/cache";
import { getSession, scoped } from "@/lib/session";
import { emitEvent } from "@/lib/automations/events";

/** Marks a task complete (sets completedAt) or reopens it. Tenant-scoped (RLS). */
export async function setTaskDone(id: string, done: boolean): Promise<void> {
  await scoped(async (db) => {
    const task = await db.activity.findFirst({ where: { id, type: "TASK" }, select: { id: true } });
    if (!task) throw new Error("Aufgabe nicht gefunden");
    await db.activity.update({ where: { id }, data: { completedAt: done ? new Date() : null } });
  });
  if (done) await emitEvent("task.completed", { type: "Task", id });
  revalidatePath("/activities");
}

function clean(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : null;
}

/**
 * Creates a standalone task (an Activity of type TASK), optionally linked to a
 * contact or deal. The author is the current user. Fires `task.created` so
 * task-trigger automations run. Any linked contact/deal is verified in-org by
 * RLS — an out-of-org id resolves to null and the link is dropped.
 */
export async function createTask(formData: FormData): Promise<void> {
  const subject = clean(formData.get("subject"));
  if (!subject) throw new Error("Betreff fehlt");
  const dueRaw = clean(formData.get("dueAt"));
  const contactId = clean(formData.get("contactId"));
  const dealId = clean(formData.get("dealId"));
  const session = await getSession();
  const authorId = session?.user.id ?? null;

  const taskId = await scoped(async (db, organizationId) => {
    // Verify the optional links belong to the org before attaching them.
    const validContactId = contactId
      ? (await db.contact.findFirst({ where: { id: contactId }, select: { id: true } }))?.id ?? null
      : null;
    const validDealId = dealId
      ? (await db.deal.findFirst({ where: { id: dealId }, select: { id: true } }))?.id ?? null
      : null;
    const task = await db.activity.create({
      data: {
        organizationId,
        type: "TASK",
        subject,
        dueAt: dueRaw ? new Date(dueRaw) : null,
        contactId: validContactId,
        dealId: validDealId,
        authorId,
      },
      select: { id: true },
    });
    return task.id;
  });

  await emitEvent("task.created", { type: "Task", id: taskId });
  revalidatePath("/activities");
}
