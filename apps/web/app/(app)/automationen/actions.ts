"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma, PrismaClient } from "@kundeo/db";
import { getSession, scoped } from "@/lib/session";
import type { FlatStep } from "@/components/automations/catalogue";
import { templateById, type TemplateStep } from "@/components/automations/templates";

export interface WorkflowDraft {
  name: string;
  steps: FlatStep[];
}

/**
 * Replace a workflow's steps wholesale inside the tenant transaction. The
 * builder edits a local tree and saves the whole flow; this deletes the old
 * rows and recreates them (parents before children so the self-FK holds).
 * Client-supplied ids are kept stable across saves. Run history is untouched —
 * WorkflowRunStep.stepId is a soft reference.
 */
async function writeSteps(
  db: Prisma.TransactionClient | PrismaClient,
  workflowId: string,
  steps: FlatStep[],
) {
  await db.workflowStep.deleteMany({ where: { workflowId } });
  const rows = steps.map((s) => ({
    id: s.id,
    workflowId,
    kind: s.kind,
    type: s.type,
    order: s.order,
    parentStepId: s.parentStepId,
    branchPath: s.branchPath,
    config: (s.config ?? {}) as Prisma.InputJsonValue,
  }));
  const main = rows.filter((r) => r.parentStepId === null);
  const children = rows.filter((r) => r.parentStepId !== null);
  if (main.length) await db.workflowStep.createMany({ data: main });
  if (children.length) await db.workflowStep.createMany({ data: children });
}

/** Switch a workflow on or off from the list row. */
export async function setWorkflowActive(id: string, isActive: boolean) {
  await scoped((db) => db.workflow.update({ where: { id }, data: { isActive } }));
  revalidatePath("/automationen");
}

/** Create an empty draft and open it in the builder. */
export async function createWorkflow() {
  const session = await getSession();
  const createdBy = session?.user.id ?? "system";
  const wf = await scoped((db, organizationId) =>
    db.workflow.create({
      data: { organizationId, name: "Neue Automation", isActive: false, createdBy },
    }),
  );
  revalidatePath("/automationen");
  redirect(`/automationen/${wf.id}`);
}

/** Flatten a template's nested step tree into persistable rows with fresh ids. */
function templateToFlatSteps(steps: TemplateStep[]): FlatStep[] {
  const out: FlatStep[] = [];
  steps.forEach((s, i) => {
    const id = randomUUID();
    out.push({ id, kind: s.kind, type: s.type, order: i, parentStepId: null, branchPath: null, config: s.config ?? {} });
    if (s.kind === "BRANCH") {
      (["yes", "no"] as const).forEach((laneKey) => {
        const path = laneKey === "yes" ? "YES" : "NO";
        (s[laneKey] ?? []).forEach((c, j) => {
          out.push({ id: randomUUID(), kind: c.kind, type: c.type, order: j, parentStepId: id, branchPath: path, config: c.config ?? {} });
        });
      });
    }
  });
  return out;
}

/** Create a draft from a starter template and open it in the builder. */
export async function createFromTemplate(templateId: string) {
  const template = templateById(templateId);
  if (!template) redirect("/automationen/vorlagen");
  const session = await getSession();
  const createdBy = session?.user.id ?? "system";
  const wf = await scoped(async (db, organizationId) => {
    const created = await db.workflow.create({
      data: { organizationId, name: template.name, isActive: false, createdBy },
    });
    await writeSteps(db, created.id, templateToFlatSteps(template.steps));
    return created;
  });
  revalidatePath("/automationen");
  redirect(`/automationen/${wf.id}`);
}

/** Delete a workflow (and, by cascade, its steps and run history). */
export async function deleteWorkflow(id: string) {
  await scoped((db) => db.workflow.delete({ where: { id } }));
  revalidatePath("/automationen");
  redirect("/automationen");
}

/** Autosave the draft: workflow name + the whole step tree. */
export async function saveWorkflowDraft(id: string, draft: WorkflowDraft) {
  await scoped(async (db) => {
    await db.workflow.update({ where: { id }, data: { name: draft.name } });
    await writeSteps(db, id, draft.steps);
  });
  revalidatePath("/automationen");
  revalidatePath(`/automationen/${id}`);
}

/** Persist, then switch the workflow on and bump its version. */
export async function publishWorkflow(id: string, draft: WorkflowDraft) {
  await scoped(async (db) => {
    await writeSteps(db, id, draft.steps);
    await db.workflow.update({
      where: { id },
      data: { name: draft.name, isActive: true, version: { increment: 1 } },
    });
  });
  revalidatePath("/automationen");
  revalidatePath(`/automationen/${id}`);
}
