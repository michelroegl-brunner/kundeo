"use client";

import { useEffect, useMemo, useState, useTransition, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { DealCard } from "@/components/ui/deal-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { Toast } from "@/components/ui/toast";
import { moveDeal } from "@/app/(app)/deals/actions";

export interface PipelineStage {
  id: string;
  name: string;
  probability: number;
}

export interface PipelineDeal {
  id: string;
  title: string;
  company: string;
  amountCents: number;
  currency: "EUR" | "CHF";
  ownerId: string | null;
  ownerName: string;
  dueLabel?: string;
  overdue: boolean;
  stageId: string;
}

export interface PipelineBoardProps {
  stages: PipelineStage[];
  deals: PipelineDeal[];
  /** ownerId → display name, for the owner filter. */
  owners: { id: string; name: string }[];
}

function sumCents(deals: PipelineDeal[]): string {
  const total = deals.reduce((a, d) => a + d.amountCents, 0);
  return (total / 100).toLocaleString("de-DE", { maximumFractionDigits: 0 }) + " EUR";
}

export function PipelineBoard({ stages, deals, owners }: PipelineBoardProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Local, optimistic view of stage assignment. Re-seeded whenever the server
  // sends fresh data (after revalidatePath) so a reverted move self-corrects.
  const [board, setBoard] = useState<PipelineDeal[]>(deals);
  useEffect(() => setBoard(deals), [deals]);

  const [ownerFilter, setOwnerFilter] = useState("all");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(
    () => (ownerFilter === "all" ? board : board.filter((d) => d.ownerId === ownerFilter)),
    [board, ownerFilter],
  );
  const byStage = useMemo(() => {
    const map = new Map<string, PipelineDeal[]>();
    for (const s of stages) map.set(s.id, []);
    for (const d of visible) map.get(d.stageId)?.push(d);
    return map;
  }, [visible, stages]);

  function drop(stageId: string) {
    const id = draggingId;
    setDraggingId(null);
    setOverStage(null);
    if (!id) return;
    const deal = board.find((d) => d.id === id);
    if (!deal || deal.stageId === stageId) return;

    const previous = board;
    setBoard((b) => b.map((d) => (d.id === id ? { ...d, stageId } : d)));
    startTransition(async () => {
      try {
        await moveDeal(id, stageId);
        router.refresh();
      } catch {
        setBoard(previous); // roll back the optimistic move
        setError("Deal konnte nicht verschoben werden.");
      }
    });
  }

  const ownerOptions = [
    { value: "all", label: "Alle Inhaber" },
    ...owners.map((o) => ({ value: o.id, label: o.name })),
  ];

  return (
    <>
      <div className="flex items-center gap-3">
        {owners.length ? (
          <Select
            size="sm"
            fullWidth={false}
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            options={ownerOptions}
            style={{ width: 180 }}
          />
        ) : null}
        <span className="ml-auto font-sans text-xs text-content-muted">
          Karte in eine andere Phase ziehen
        </span>
      </div>

      <div className="grid items-start gap-3" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0,1fr))` }}>
        {stages.map((s) => {
          const items = byStage.get(s.id) ?? [];
          const isTarget = draggingId != null && overStage === s.id && board.find((d) => d.id === draggingId)?.stageId !== s.id;
          return (
            <section
              key={s.id}
              onDragOver={(e: DragEvent) => {
                e.preventDefault();
                setOverStage(s.id);
              }}
              onDragLeave={(e: DragEvent) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverStage((cur) => (cur === s.id ? null : cur));
              }}
              onDrop={(e: DragEvent) => {
                e.preventDefault();
                drop(s.id);
              }}
              className={cn(
                "flex min-h-[240px] flex-col gap-2 rounded-lg border p-3 transition duration-[120ms] ease-out",
                isTarget ? "border-edge-brand bg-surface-brand-subtle" : "border-edge bg-surface-sunken",
              )}
            >
              <header className="flex items-center gap-2 pb-1">
                <span className="font-sans text-2xs font-semibold uppercase tracking-wide text-content-secondary">{s.name}</span>
                <span className="font-mono text-2xs text-content-subtle">{s.probability} %</span>
                <span className="ml-auto font-mono text-2xs tabular-nums text-content-muted">{items.length}</span>
              </header>
              <div className="pb-1 font-mono text-xs font-medium tabular-nums text-content">{sumCents(items)}</div>

              {items.length ? (
                items.map((d) => (
                  <div
                    key={d.id}
                    draggable
                    onDragStart={(e: DragEvent) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", d.id);
                      setDraggingId(d.id);
                    }}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setOverStage(null);
                    }}
                  >
                    <DealCard
                      title={d.title}
                      company={d.company}
                      amountCents={d.amountCents}
                      currency={d.currency}
                      owner={d.ownerName || undefined}
                      dueLabel={d.dueLabel}
                      overdue={d.overdue}
                      dragging={draggingId === d.id}
                    />
                  </div>
                ))
              ) : (
                <EmptyState compact icon="inbox" title="Keine Deals" description="Diese Phase ist leer." />
              )}
            </section>
          );
        })}
      </div>

      {error ? (
        <div className="fixed bottom-6 right-6 z-50">
          <Toast tone="danger" title="Verschieben fehlgeschlagen" description={error} onClose={() => setError(null)} />
        </div>
      ) : null}
    </>
  );
}
