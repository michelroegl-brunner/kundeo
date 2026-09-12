import { notFound } from "next/navigation";
import { scoped } from "@/lib/session";
import { buildTree, type FlatStep } from "@/components/automations/catalogue";
import { FlowBuilder } from "@/components/automations/flow-builder";

export const dynamic = "force-dynamic";

export default async function BuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { workflow, emailTemplates } = await scoped(async (db) => {
    const workflow = await db.workflow.findUnique({
      where: { id },
      include: {
        steps: {
          select: { id: true, kind: true, type: true, order: true, parentStepId: true, branchPath: true, config: true },
        },
      },
    });
    const emailTemplates = await db.emailTemplate.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
    return { workflow, emailTemplates };
  });
  if (!workflow) notFound();

  const tree = buildTree(workflow.steps as FlatStep[]);

  // The builder is a full-height editor with its own top bar: break out of the
  // padded, max-width content wrapper and fill the area under the app top bar.
  return (
    <div className="-mx-6 -my-6 h-[calc(100dvh-var(--topbar-height))] overflow-hidden">
      <FlowBuilder
        workflow={{ id: workflow.id, name: workflow.name, isActive: workflow.isActive, version: workflow.version }}
        initialSteps={tree}
        emailTemplates={emailTemplates}
      />
    </div>
  );
}
