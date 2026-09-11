import { scoped } from "@/lib/session";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/format";
import { PipelineBoard, type PipelineDeal, type PipelineStage } from "@/components/pipeline/pipeline-board";

export const dynamic = "force-dynamic";

export default async function DealsPage() {
  const { pipeline, deals, members } = await scoped(async (db) => {
    const pipeline = await db.pipeline.findFirst({
      where: { isDefault: true },
      orderBy: { createdAt: "asc" },
      include: { stages: { orderBy: { order: "asc" } } },
    });

    const [deals, members] = await Promise.all([
      pipeline
        ? db.deal.findMany({
            where: { status: "OPEN", pipelineId: pipeline.id },
            include: { company: { select: { name: true } } },
            orderBy: { updatedAt: "desc" },
          })
        : Promise.resolve([]),
      db.member.findMany({ include: { user: { select: { id: true, name: true } } } }),
    ]);

    return { pipeline, deals, members };
  });

  if (!pipeline || pipeline.stages.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="kanban"
          title="Keine Pipeline eingerichtet"
          description="Sobald eine Pipeline mit Phasen angelegt ist, erscheint hier das Board."
        />
      </Card>
    );
  }

  const nameById = new Map(members.map((m) => [m.user.id, m.user.name]));
  const now = Date.now();

  const stages: PipelineStage[] = pipeline.stages.map((s) => ({
    id: s.id,
    name: s.name,
    probability: s.probability,
  }));

  const boardDeals: PipelineDeal[] = deals.map((d) => ({
    id: d.id,
    title: d.title,
    company: d.company?.name ?? "",
    amountCents: d.amountCents,
    currency: d.currency === "CHF" ? "CHF" : "EUR",
    ownerId: d.ownerId,
    ownerName: (d.ownerId && nameById.get(d.ownerId)) || "",
    dueLabel: d.expectedCloseAt ? formatDate(d.expectedCloseAt) : undefined,
    overdue: d.expectedCloseAt ? d.expectedCloseAt.getTime() < now : false,
    stageId: d.stageId,
  }));

  // Owners that actually have deals on this board — keeps the filter relevant.
  const ownerIds = new Set(boardDeals.map((d) => d.ownerId).filter(Boolean) as string[]);
  const owners = [...ownerIds].map((id) => ({ id, name: nameById.get(id) ?? "Unbekannt" }));

  return <PipelineBoard stages={stages} deals={boardDeals} owners={owners} />;
}
