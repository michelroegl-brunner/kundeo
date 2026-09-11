"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { Toast } from "@/components/ui/toast";
import { StepCard, Connector, EndCap, Fork, Merge } from "./flow-steps";
import { Palette, InsertDialog, TestRunDialog, useNarrow } from "./builder-parts";
import { ConfigPanel } from "./config-panel";
import {
  flattenTree,
  isStepComplete,
  type FlowStep,
  type NodeDef,
} from "./catalogue";
import { saveWorkflowDraft, publishWorkflow, setWorkflowActive } from "@/app/(app)/automationen/actions";

const sid = () => "s_" + Math.random().toString(36).slice(2, 10);

type InsertAt = { index: number; lane?: "yes" | "no" };
type ToastMsg = { tone: "success" | "info"; title: string; description?: string };

export interface BuilderWorkflow {
  id: string;
  name: string;
  isActive: boolean;
  version: number;
}

function makeStep(item: NodeDef): FlowStep {
  if (item.kind === "BRANCH") {
    return {
      id: sid(),
      kind: "BRANCH",
      type: item.type,
      config: { condition: { entity: "Deal", field: "amount", op: "ist größer als", value: "" } },
      yes: [],
      no: [],
    };
  }
  return { id: sid(), kind: item.kind, type: item.type, config: {} };
}

export function FlowBuilder({ workflow, initialSteps }: { workflow: BuilderWorkflow; initialSteps: FlowStep[] }) {
  const router = useRouter();
  const narrow = useNarrow();

  const [steps, setSteps] = useState<FlowStep[]>(initialSteps);
  const [name, setName] = useState(workflow.name);
  const [editingName, setEditingName] = useState(false);
  const [active, setActive] = useState(workflow.isActive);
  const [version, setVersion] = useState(workflow.version);
  const [selected, setSelected] = useState<string | null>(initialSteps[0]?.id ?? null);
  const [insertAt, setInsertAt] = useState<InsertAt | null>(null);
  const [drag, setDrag] = useState<NodeDef | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [bannerOpen, setBannerOpen] = useState(false);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [, startTransition] = useTransition();

  const branchIndex = steps.findIndex((s) => s.kind === "BRANCH");
  const canvas = branchIndex !== -1;
  const branch = canvas ? steps[branchIndex]! : null;

  const allSteps = useMemo(() => {
    const out: FlowStep[] = [];
    for (const s of steps) {
      out.push(s);
      if (s.kind === "BRANCH") {
        (s.yes ?? []).forEach((x) => out.push(x));
        (s.no ?? []).forEach((x) => out.push(x));
      }
    }
    return out;
  }, [steps]);

  const invalidCount = allSteps.filter((s) => !isStepComplete(s.type, s.config)).length;
  const hasTrigger = steps.some((s) => s.kind === "TRIGGER");
  const selectedStep = allSteps.find((s) => s.id === selected) ?? null;

  // ── Debounced autosave. Skips the first render; compares serialized flow. ──
  const lastSaved = useRef(JSON.stringify({ name: workflow.name, steps: flattenTree(initialSteps) }));
  useEffect(() => {
    const payload = { name, steps: flattenTree(steps) };
    const serialized = JSON.stringify(payload);
    if (serialized === lastSaved.current) return;
    setSaveState("saving");
    const t = setTimeout(() => {
      startTransition(async () => {
        try {
          await saveWorkflowDraft(workflow.id, payload);
          lastSaved.current = serialized;
          setSaveState("saved");
        } catch {
          setSaveState("idle");
          setToast({ tone: "info", title: "Nicht gespeichert", description: "Änderung konnte nicht gesichert werden." });
        }
      });
    }, 800);
    return () => clearTimeout(t);
  }, [name, steps, workflow.id]);

  // ── Tree mutations ────────────────────────────────────────────────────────
  function insert(item: NodeDef, at: InsertAt | null) {
    const step = makeStep(item);
    setSteps((xs) => {
      if (at?.lane && branch) {
        return xs.map((s) =>
          s.kind === "BRANCH"
            ? { ...s, [at.lane!]: [...(s[at.lane!] ?? []).slice(0, at.index), step, ...(s[at.lane!] ?? []).slice(at.index)] }
            : s,
        );
      }
      const idx = at ? at.index : xs.length;
      return [...xs.slice(0, idx), step, ...xs.slice(idx)];
    });
    setSelected(step.id);
    setInsertAt(null);
    setPanelOpen(true);
    if (step.kind === "BRANCH") {
      setBannerOpen(true);
      setToast({ tone: "info", title: "Arbeitsfläche geöffnet", description: "Der Ablauf hat jetzt zwei Pfade — Ja und Nein." });
    }
  }

  function updateStep(next: FlowStep) {
    setSteps((xs) =>
      xs.map((s) => {
        if (s.id === next.id) return next;
        if (s.kind === "BRANCH") {
          return {
            ...s,
            yes: (s.yes ?? []).map((x) => (x.id === next.id ? next : x)),
            no: (s.no ?? []).map((x) => (x.id === next.id ? next : x)),
          };
        }
        return s;
      }),
    );
  }

  function remove(id: string) {
    setSteps((xs) =>
      xs
        .filter((s) => s.id !== id)
        .map((s) =>
          s.kind === "BRANCH"
            ? { ...s, yes: (s.yes ?? []).filter((x) => x.id !== id), no: (s.no ?? []).filter((x) => x.id !== id) }
            : s,
        ),
    );
    if (selected === id) setSelected(null);
  }

  function dropProps(key: string, at: InsertAt) {
    return {
      dropActive: dropTarget === key && !!drag,
      onDragOver: (e: DragEvent) => {
        if (drag) {
          e.preventDefault();
          setDropTarget(key);
        }
      },
      onDragLeave: () => setDropTarget((t) => (t === key ? null : t)),
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        if (drag) {
          insert(drag, at);
          setDrag(null);
          setDropTarget(null);
        }
      },
    };
  }

  function select(id: string) {
    setSelected(id);
    setPanelOpen(true);
  }

  // ── Publish / activate ──────────────────────────────────────────────────
  function publish() {
    if (invalidCount) return;
    startTransition(async () => {
      await publishWorkflow(workflow.id, { name, steps: flattenTree(steps) });
      setActive(true);
      setVersion((v) => v + 1);
      lastSaved.current = JSON.stringify({ name, steps: flattenTree(steps) });
      setToast({ tone: "success", title: "Automation veröffentlicht", description: `Version ${version + 1} ist aktiv.` });
    });
  }

  function toggleActive(on: boolean) {
    setActive(on);
    setToast({ tone: on ? "success" : "info", title: on ? "Automation eingeschaltet" : "Automation ausgeschaltet" });
    startTransition(() => setWorkflowActive(workflow.id, on));
  }

  // ── Flow rendering ────────────────────────────────────────────────────────
  const renderColumn = (list: FlowStep[], laneKey?: "yes" | "no", baseIndex = 0) =>
    list.map((s, i) => (
      <div key={s.id}>
        <StepCard step={s} index={laneKey ? null : baseIndex + i + 1} selected={selected === s.id} onSelect={select} onDelete={remove} compact={!!laneKey} />
        <Connector
          onInsert={() => setInsertAt({ index: i + 1, lane: laneKey })}
          {...dropProps(`${laneKey ?? "main"}:${i + 1}`, { index: i + 1, lane: laneKey })}
        />
      </div>
    ));

  const flow = canvas ? (
    <div
      className="mx-auto w-full max-w-[940px] pb-12"
      style={{ transform: `scale(${zoom})`, transformOrigin: "top center", transition: "transform var(--duration-base) var(--ease-out)" }}
    >
      <div className="mx-auto max-w-[560px]">
        {renderColumn(steps.slice(0, branchIndex))}
        <StepCard step={branch!} index={branchIndex + 1} selected={selected === branch!.id} onSelect={select} onDelete={remove} />
      </div>

      <Fork labels={["Ja", "Nein"]} />

      <div className="grid grid-cols-2 gap-8 pt-5 max-md:grid-cols-1 max-md:gap-4">
        {(["yes", "no"] as const).map((lane) => (
          <div key={lane} className="flex min-w-0 flex-col">
            {(branch![lane] ?? []).length ? (
              renderColumn(branch![lane] ?? [], lane)
            ) : (
              <div className="rounded-lg border border-dashed border-edge-strong p-4 text-center">
                <p className="text-xs text-content-muted">Dieser Pfad ist leer</p>
                <Button size="sm" variant="ghost" iconLeft="plus" onClick={() => setInsertAt({ index: 0, lane })}>
                  Schritt hinzufügen
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      <Merge />

      <div className="mx-auto max-w-[560px]">
        {steps.slice(branchIndex + 1).map((s, i) => (
          <div key={s.id}>
            <StepCard step={s} index={branchIndex + 2 + i} selected={selected === s.id} onSelect={select} onDelete={remove} />
            <Connector
              onInsert={() => setInsertAt({ index: branchIndex + 2 + i })}
              {...dropProps(`main:${branchIndex + 2 + i}`, { index: branchIndex + 2 + i })}
            />
          </div>
        ))}
        <EndCap label="Ende der Automation" />
      </div>
    </div>
  ) : (
    <div className="mx-auto w-full max-w-[560px] pb-12">
      {steps.length ? (
        renderColumn(steps)
      ) : (
        <div className="rounded-lg border border-dashed border-edge-strong p-6 text-center">
          <p className="text-xs text-content-muted">Noch keine Schritte. Wählen Sie links einen Auslöser.</p>
        </div>
      )}
      <EndCap label="Ende der Automation" />
    </div>
  );

  const savedLabel =
    saveState === "saving" ? "wird gespeichert …" : saveState === "saved" ? "gespeichert" : "Entwurf";

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-page">
      {/* top bar */}
      <header className="flex h-14 flex-none items-center gap-3 border-b border-edge bg-surface-card px-4">
        <IconButton icon="arrow-left" label="Zurück zur Übersicht" onClick={() => router.push("/automationen")} />
        <div className="flex min-w-0 items-center gap-2">
          {editingName ? (
            <Input
              size="sm"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => e.key === "Enter" && setEditingName(false)}
              fullWidth={false}
              style={{ width: 320 }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="-mx-1.5 inline-flex max-w-[360px] items-center gap-1.5 truncate rounded-sm px-1.5 py-1 text-md font-semibold tracking-snug text-content"
              style={{ cursor: "text" }}
            >
              <span className="truncate">{name}</span>
              <Icon name="pencil" size={13} color="var(--text-subtle)" />
            </button>
          )}
          <Badge tone={active ? "success" : "neutral"} dot>{active ? "Aktiv" : "Entwurf"}</Badge>
        </div>
        <span className="inline-flex items-center gap-1.5 font-mono text-2xs text-content-subtle max-md:hidden">
          <Icon name="history" size={12} />v{version} · {savedLabel}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {invalidCount ? (
            <Tooltip label={`${invalidCount} Schritt(e) unvollständig`}>
              <span
                className="inline-flex h-[26px] items-center gap-1.5 rounded-sm px-2.5 text-2xs font-semibold"
                style={{ background: "var(--surface-warning-subtle)", color: "var(--amber-600)" }}
              >
                <Icon name="triangle-alert" size={13} />
                {invalidCount} unvollständig
              </span>
            </Tooltip>
          ) : null}
          <Button variant="ghost" size="sm" iconLeft="history" onClick={() => router.push(`/automationen/${workflow.id}/protokoll`)}>
            Protokoll
          </Button>
          <Button variant="secondary" size="sm" iconLeft="flask-conical" onClick={() => setTestOpen(true)}>
            Testlauf
          </Button>
          <span className="flex items-center gap-2 pl-2">
            <Switch checked={active} onChange={toggleActive} />
            <Button size="sm" disabled={!!invalidCount} onClick={publish}>Veröffentlichen</Button>
          </span>
        </div>
      </header>

      {/* body */}
      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: narrow ? "1fr" : "232px minmax(0,1fr) 344px" }}>
        {narrow ? null : <Palette hasTrigger={hasTrigger} onAdd={(item) => insert(item, null)} onDragStart={setDrag} />}

        <div
          className="relative min-w-0 overflow-auto px-6 pt-6"
          style={{
            backgroundImage: canvas ? "radial-gradient(var(--neutral-300) 1px, transparent 1px)" : "none",
            backgroundSize: "18px 18px",
            transition: "background-image var(--duration-slow) var(--ease-out)",
          }}
        >
          <div className="mx-auto mb-4 flex max-w-[940px] items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-content-muted">
              <Icon name={canvas ? "layout-grid" : "list"} size={13} />
              {canvas ? "Arbeitsfläche" : "Schrittliste"}
            </span>
            {canvas ? (
              <span className="ml-auto flex items-center gap-1">
                <IconButton icon="zoom-out" label="Verkleinern" size="sm" variant="outline" onClick={() => setZoom((z) => Math.max(0.7, +(z - 0.15).toFixed(2)))} />
                <span className="w-[38px] text-center font-mono text-2xs text-content-muted">{Math.round(zoom * 100)} %</span>
                <IconButton icon="zoom-in" label="Vergrößern" size="sm" variant="outline" onClick={() => setZoom((z) => Math.min(1.3, +(z + 0.15).toFixed(2)))} />
              </span>
            ) : (
              <span className="ml-auto text-2xs text-content-subtle">
                Wird zur Arbeitsfläche, sobald Sie eine Verzweigung einfügen
              </span>
            )}
          </div>

          {canvas && bannerOpen ? (
            <div
              className="mx-auto mb-5 flex max-w-[940px] items-start gap-3 rounded-lg bg-surface-card p-3 shadow-sm"
              style={{ border: "1px solid var(--border-brand)" }}
            >
              <Icon name="git-branch" size={16} color="var(--text-brand)" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-content">Ihr Ablauf hat jetzt zwei Pfade</p>
                <p className="mt-0.5 text-2xs leading-normal text-content-secondary">
                  Links geht es weiter, wenn die Bedingung zutrifft („Ja“), rechts, wenn nicht („Nein“). Danach laufen
                  beide Pfade wieder zusammen. Entfernen Sie die Verzweigung, wird daraus wieder eine einfache Liste.
                </p>
              </div>
              <IconButton icon="x" label="Hinweis schließen" size="sm" onClick={() => setBannerOpen(false)} />
            </div>
          ) : null}

          {flow}
        </div>

        {narrow ? (
          panelOpen && selectedStep ? (
            <div className="absolute inset-0 z-50 flex justify-end" style={{ background: "var(--surface-overlay)" }} onClick={() => setPanelOpen(false)}>
              <div onClick={(e) => e.stopPropagation()} className="w-[min(380px,92%)] border-l border-edge bg-surface-card shadow-xl">
                <ConfigPanel step={selectedStep} onChange={updateStep} onClose={() => setPanelOpen(false)} onDelete={remove} />
              </div>
            </div>
          ) : null
        ) : (
          <aside className="min-w-0 overflow-hidden border-l border-edge bg-surface-card">
            <ConfigPanel step={selectedStep} onChange={updateStep} onClose={() => setSelected(null)} onDelete={remove} />
          </aside>
        )}
      </div>

      {narrow ? (
        <div className="flex gap-2 border-t border-edge bg-surface-card px-4 py-3">
          <Button size="sm" variant="secondary" iconLeft="plus" fullWidth onClick={() => setInsertAt({ index: steps.length })}>
            Schritt hinzufügen
          </Button>
          {selectedStep ? (
            <Button size="sm" variant="ghost" iconLeft="settings" onClick={() => setPanelOpen(true)}>
              Bearbeiten
            </Button>
          ) : null}
        </div>
      ) : null}

      <InsertDialog open={!!insertAt} onClose={() => setInsertAt(null)} onPick={(item) => insert(item, insertAt)} />
      <TestRunDialog open={testOpen} onClose={() => setTestOpen(false)} steps={steps} />

      {toast ? (
        <div className="fixed bottom-6 right-6 z-[70]">
          <Toast tone={toast.tone} title={toast.title} description={toast.description} onClose={() => setToast(null)} />
        </div>
      ) : null}
    </div>
  );
}
