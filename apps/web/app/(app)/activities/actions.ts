"use server";

import { revalidatePath } from "next/cache";
import { scoped } from "@/lib/session";

/** Marks a task complete (sets completedAt) or reopens it. Tenant-scoped (RLS). */
export async function setTaskDone(id: string, done: boolean): Promise<void> {
  await scoped(async (db) => {
    const task = await db.activity.findFirst({ where: { id, type: "TASK" }, select: { id: true } });
    if (!task) throw new Error("Aufgabe nicht gefunden");
    await db.activity.update({ where: { id }, data: { completedAt: done ? new Date() : null } });
  });
  revalidatePath("/activities");
}
