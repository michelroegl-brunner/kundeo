"use client";

import { useMemo, useState, useTransition } from "react";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/ui/empty-state";
import { createWorkflow, createFromTemplate } from "@/app/(app)/automationen/actions";
import { TEMPLATE_GROUPS, countSteps, type TemplateDef } from "@/components/automations/templates";

function TemplateCard({
  t,
  steps,
  pending,
  onUse,
}: {
  t: TemplateDef;
  steps: number;
  pending: boolean;
  onUse: () => void;
}) {
  return (
    <article className="flex min-w-0 flex-col gap-2 rounded-lg border border-edge bg-surface-card p-4 shadow-xs transition hover:border-edge-strong hover:shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold tracking-tight text-content">{t.name}</h3>
        {t.popular ? <Badge tone="brand">Beliebt</Badge> : null}
        {t.branching ? <Badge tone="neutral" icon="git-branch">Verzweigung</Badge> : null}
      </div>
      <p className="m-0 flex-1 text-xs leading-relaxed text-content-secondary">{t.desc}</p>
      <div className="mt-1 flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-2xs text-content-subtle">
          <Icon name="list" size={12} />
          {steps} Schritte
        </span>
        {t.consent ? (
          <Tooltip label="Nur Kontakte mit Einwilligung">
            <span className="inline-flex items-center gap-1.5 text-2xs" style={{ color: "var(--text-success)" }}>
              <Icon name="shield-check" size={12} />
              DSGVO-geprüft
            </span>
          </Tooltip>
        ) : null}
        <Button size="sm" variant="secondary" className="ml-auto" loading={pending} onClick={onUse}>
          Vorlage verwenden
        </Button>
      </div>
    </article>
  );
}

export function TemplateGallery() {
  const [q, setQ] = useState("");
  const [active, setActive] = useState("Alle");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const chips = useMemo(() => ["Alle", ...TEMPLATE_GROUPS.map((g) => g.group)], []);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return TEMPLATE_GROUPS.filter((g) => active === "Alle" || g.group === active)
      .map((g) => ({ ...g, items: g.items.filter((t) => (t.name + t.desc).toLowerCase().includes(needle)) }))
      .filter((g) => g.items.length);
  }, [q, active]);

  function applyTemplate(id: string) {
    setPendingId(id);
    startTransition(() => createFromTemplate(id));
  }

  function newBlank() {
    setPendingId("__blank__");
    startTransition(() => createWorkflow());
  }

  return (
    <>
      <PageHeader
        title="Vorlagen"
        actions={
          <Button variant="secondary" size="sm" iconLeft="plus" loading={pendingId === "__blank__"} onClick={newBlank}>
            Leere Automation
          </Button>
        }
      />

      <Card padding="lg">
        <div className="flex flex-wrap items-start gap-5">
          <div className="min-w-[280px] flex-1">
            <h2 className="text-xl font-semibold tracking-tight text-content">Mit einer Vorlage starten</h2>
            <p className="mt-2 max-w-[40rem] text-sm leading-relaxed text-content-secondary">
              Jede Vorlage ist eine fertige Automation. Sie wird als Entwurf angelegt — Sie prüfen die Schritte,
              passen Texte an und schalten sie danach selbst ein.
            </p>
          </div>
          <Button variant="secondary" iconLeft="plus" loading={pendingId === "__blank__"} onClick={newBlank}>
            Leere Automation
          </Button>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          size="sm"
          iconLeft="search"
          placeholder="Vorlage suchen …"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          fullWidth={false}
          style={{ width: 240 }}
        />
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => {
            const on = active === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setActive(c)}
                className="h-[30px] cursor-pointer rounded-full border px-3 text-xs font-medium transition"
                style={{
                  borderColor: on ? "var(--border-brand)" : "var(--border-default)",
                  background: on ? "var(--surface-brand-subtle)" : "var(--surface-card)",
                  color: on ? "var(--text-brand)" : "var(--text-secondary)",
                }}
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>

      {shown.length ? (
        shown.map((g) => (
          <section key={g.group} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Icon name={g.icon} size={15} color="var(--text-muted)" />
              <h3 className="text-2xs font-semibold uppercase tracking-wide text-content-muted">{g.group}</h3>
              <span className="font-mono text-2xs text-content-subtle">{g.items.length}</span>
            </div>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
              {g.items.map((t) => (
                <TemplateCard
                  key={t.id}
                  t={t}
                  steps={countSteps(t.steps)}
                  pending={pendingId === t.id}
                  onUse={() => applyTemplate(t.id)}
                />
              ))}
            </div>
          </section>
        ))
      ) : (
        <Card>
          <EmptyState
            icon="sparkles"
            title="Keine Vorlage gefunden"
            description="Passen Sie die Suche an oder legen Sie eine leere Automation an."
            action={
              <Button size="sm" iconLeft="plus" loading={pendingId === "__blank__"} onClick={newBlank}>
                Leere Automation
              </Button>
            }
          />
        </Card>
      )}
    </>
  );
}
