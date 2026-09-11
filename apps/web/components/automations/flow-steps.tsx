"use client";

import { useState, type DragEvent } from "react";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { IconButton } from "@/components/ui/icon-button";
import {
  KIND_META,
  nodeDef,
  isStepComplete,
  stepSentence,
  filterText,
  type FlowStep,
  type FilterClause,
} from "./catalogue";

/** One step = one plain German sentence. Never config, never syntax. */
export function StepCard({
  step,
  index,
  selected,
  onSelect,
  onDelete,
  compact = false,
}: {
  step: FlowStep;
  index: number | null;
  selected: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  compact?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const meta = KIND_META[step.kind] ?? KIND_META.ACTION;
  const invalid = !isStepComplete(step.type, step.config);
  const def = nodeDef(step.type);
  const filters = (step.config?.filters as FilterClause[] | undefined) ?? [];
  const border = selected
    ? "var(--border-brand)"
    : invalid
      ? "var(--amber-500)"
      : hover
        ? "var(--border-strong)"
        : "var(--border-default)";

  return (
    <div
      onClick={() => onSelect(step.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`relative flex w-full cursor-pointer items-start gap-3 rounded-lg bg-surface-card text-left transition duration-[120ms] ease-out ${compact ? "p-3" : "px-4 py-3"}`}
      style={{ border: `1px solid ${border}`, boxShadow: selected ? "var(--ring-brand)" : hover ? "var(--shadow-sm)" : "var(--shadow-xs)" }}
    >
      <span
        className="grid h-[30px] w-[30px] flex-none place-items-center rounded-md"
        style={{ background: meta.bg, color: meta.color }}
      >
        <Icon name={def.icon} size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="mb-0.5 flex items-center gap-2">
          <span className="text-2xs font-semibold uppercase tracking-wide text-content-subtle">
            {index != null ? `Schritt ${index} · ` : ""}
            {meta.label}
          </span>
          {invalid ? <Badge tone="warning" icon="triangle-alert">Konfiguration fehlt</Badge> : null}
        </span>
        <span className="block text-sm font-medium leading-snug text-content" style={{ textWrap: "pretty" }}>
          {stepSentence(step.type, step.config)}
        </span>
        {filters.length ? (
          <span className="mt-2 flex flex-wrap gap-1.5">
            {filters.map((f, i) => (
              <span
                key={i}
                className="inline-flex h-[22px] items-center gap-1.5 rounded-sm bg-surface-sunken px-2 text-2xs text-content-secondary"
              >
                <Icon name="filter" size={11} />
                Nur wenn {filterText(f)}
              </span>
            ))}
          </span>
        ) : null}
        {def.consent ? (
          <span className="mt-2 inline-flex items-center gap-1.5 text-2xs text-success">
            <Icon name="shield-check" size={12} />
            Kontakte ohne Einwilligung werden übersprungen
          </span>
        ) : null}
      </span>
      {step.kind !== "TRIGGER" && (hover || selected) ? (
        <span className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
          <IconButton icon="trash-2" label="Schritt entfernen" size="sm" onClick={() => onDelete(step.id)} />
        </span>
      ) : null}
    </div>
  );
}

/** Vertical connector between two steps: the 2px line plus the insert button. */
export function Connector({
  onInsert,
  dropActive = false,
  onDragOver,
  onDragLeave,
  onDrop,
  height = 26,
}: {
  onInsert: () => void;
  dropActive?: boolean;
  onDragOver?: (e: DragEvent) => void;
  onDragLeave?: (e: DragEvent) => void;
  onDrop?: (e: DragEvent) => void;
  height?: number;
}) {
  const [hover, setHover] = useState(false);
  const lit = dropActive || hover;
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="relative grid w-full place-items-center"
      style={{ height }}
    >
      <span
        className="absolute bottom-0 top-0 w-0.5 transition-[background-color] duration-[120ms] ease-out"
        style={{ background: dropActive ? "var(--kundeo-indigo)" : "var(--border-strong)" }}
      />
      <button
        type="button"
        onClick={onInsert}
        aria-label="Schritt einfügen"
        className="relative grid h-[22px] w-[22px] place-items-center rounded-full p-0 transition duration-[120ms] ease-out"
        style={{
          border: `1px solid ${lit ? "var(--border-brand)" : "var(--border-default)"}`,
          background: lit ? "var(--kundeo-indigo)" : "var(--surface-card)",
          color: lit ? "var(--text-on-brand)" : "var(--text-muted)",
          cursor: "pointer",
        }}
      >
        <Icon name="plus" size={13} />
      </button>
      {dropActive ? (
        <span className="absolute left-[calc(50%+20px)] whitespace-nowrap text-2xs font-semibold text-content-brand">
          Hier einfügen
        </span>
      ) : null}
    </div>
  );
}

/**
 * Fork bracket under a branch card: a short stem, a top bracket that splits into
 * two lanes, and the "Ja" (green) / "Nein" (neutral) pills on the two edges.
 * Drawn with CSS borders so it scales with the lanes — no canvas library.
 */
export function Fork({ labels = ["Ja", "Nein"] }: { labels?: [string, string] }) {
  return (
    <div className="relative w-full">
      <div className="grid h-[18px] place-items-center">
        <span className="h-full w-0.5" style={{ background: "var(--border-strong)" }} />
      </div>
      <div
        className="mx-[25%] h-[26px]"
        style={{
          borderTop: "2px solid var(--border-strong)",
          borderLeft: "2px solid var(--border-strong)",
          borderRight: "2px solid var(--border-strong)",
          borderRadius: "10px 10px 0 0",
        }}
      />
      {labels.map((l, i) => (
        <span
          key={l}
          className="absolute inline-flex h-5 items-center rounded-full px-2.5 text-2xs font-semibold"
          style={{
            top: 30,
            left: i === 0 ? "25%" : "75%",
            transform: "translateX(-50%)",
            background: i === 0 ? "var(--surface-success-subtle)" : "var(--surface-sunken)",
            border: `1px solid ${i === 0 ? "var(--kundeo-green)" : "var(--border-strong)"}`,
            color: i === 0 ? "var(--text-success)" : "var(--text-secondary)",
            whiteSpace: "nowrap",
          }}
        >
          {l}
        </span>
      ))}
    </div>
  );
}

/** Mirror of the fork: both lanes merge back into the shared column below. */
export function Merge() {
  return (
    <div className="w-full">
      <div
        className="mx-[25%] h-[26px]"
        style={{
          borderBottom: "2px solid var(--border-strong)",
          borderLeft: "2px solid var(--border-strong)",
          borderRight: "2px solid var(--border-strong)",
          borderRadius: "0 0 10px 10px",
        }}
      />
      <div className="grid h-[18px] place-items-center">
        <span className="h-full w-0.5" style={{ background: "var(--border-strong)" }} />
      </div>
    </div>
  );
}

export function EndCap({ label }: { label: string }) {
  return (
    <div className="flex w-full flex-col items-center">
      <span className="h-[18px] w-0.5" style={{ background: "var(--border-strong)" }} />
      <span
        className="inline-flex h-[26px] items-center gap-1.5 rounded-full px-3 text-2xs font-semibold text-content-muted"
        style={{ background: "var(--surface-sunken)", border: "1px dashed var(--border-strong)" }}
      >
        <Icon name="flag" size={12} />
        {label}
      </span>
    </div>
  );
}
