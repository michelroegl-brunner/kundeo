"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { PALETTE, stepSentence, type NodeDef, type FlowStep } from "./catalogue";

/** Collapses the builder to a single column below 1180px (tablet). */
export function useNarrow(bp = 1180) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < bp);
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [bp]);
  return narrow;
}

function PaletteItem({
  item,
  disabled,
  onAdd,
  onDragStart,
}: {
  item: NodeDef;
  disabled: boolean;
  onAdd: (item: NodeDef) => void;
  onDragStart: (item: NodeDef | null) => void;
}) {
  const [hover, setHover] = useState(false);
  const lit = hover && !disabled;
  return (
    <div
      draggable={!disabled}
      onDragStart={(e) => {
        if (disabled) return;
        onDragStart(item);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onDragEnd={() => onDragStart(null)}
      onClick={() => !disabled && onAdd(item)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={disabled ? "Eine Automation hat genau einen Auslöser" : item.sentence}
      className="flex items-center gap-2.5 rounded-md px-2 py-[7px] transition duration-[120ms] ease-out"
      style={{
        border: `1px solid ${lit ? "var(--border-default)" : "transparent"}`,
        background: lit ? "var(--surface-hover)" : "transparent",
        cursor: disabled ? "not-allowed" : "grab",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Icon name={item.icon} size={15} color="var(--text-secondary)" />
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-content">{item.name}</span>
      {item.kind === "BRANCH" ? (
        <Tooltip label="Öffnet die Arbeitsfläche">
          <Icon name="layout-grid" size={12} color="var(--text-subtle)" />
        </Tooltip>
      ) : null}
      {item.advanced ? <span className="text-2xs text-content-subtle">Profi</span> : null}
    </div>
  );
}

/** Left palette: grouped, searchable; click to append or drag onto a “+”. */
export function Palette({
  hasTrigger,
  onAdd,
  onDragStart,
}: {
  hasTrigger: boolean;
  onAdd: (item: NodeDef) => void;
  onDragStart: (item: NodeDef | null) => void;
}) {
  const [q, setQ] = useState("");
  const groups = PALETTE.map((g) => ({
    ...g,
    items: g.items.filter((i) => i.name.toLowerCase().includes(q.toLowerCase())),
  })).filter((g) => g.items.length);

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-edge bg-surface-card">
      <div className="border-b border-edge-subtle p-3">
        <Input size="sm" iconLeft="search" placeholder="Schritt suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
        <p className="mt-2 text-2xs leading-normal text-content-muted">
          Ziehen Sie einen Schritt auf ein <Icon name="plus" size={10} className="inline align-[-1px]" /> im Ablauf — oder
          klicken Sie ihn an.
        </p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
        {groups.map((g) => (
          <div key={g.group}>
            <p className="text-2xs font-semibold uppercase tracking-wide text-content-muted">{g.group}</p>
            <p className="mb-2 text-2xs text-content-subtle">{g.hint}</p>
            <div className="flex flex-col gap-1">
              {g.items.map((i) => (
                <PaletteItem
                  key={i.type}
                  item={i}
                  disabled={i.kind === "TRIGGER" && hasTrigger}
                  onAdd={onAdd}
                  onDragStart={onDragStart}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Insert picker shown when a “+” is clicked (excludes triggers). */
export function InsertDialog({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (item: NodeDef) => void;
}) {
  const [q, setQ] = useState("");
  const groups = PALETTE.filter((g) => g.group !== "Auslöser")
    .map((g) => ({ ...g, items: g.items.filter((i) => i.name.toLowerCase().includes(q.toLowerCase())) }))
    .filter((g) => g.items.length);

  return (
    <Dialog open={open} onClose={onClose} width={560} title="Schritt einfügen" description="Was soll Kundeo an dieser Stelle tun?">
      <Input size="md" iconLeft="search" placeholder="Schritt suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mt-4 flex max-h-[320px] flex-col gap-4 overflow-y-auto">
        {groups.map((g) => (
          <div key={g.group}>
            <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-content-muted">{g.group}</p>
            <div className="grid grid-cols-2 gap-2">
              {g.items.map((i) => (
                <button
                  key={i.type}
                  type="button"
                  onClick={() => onPick(i)}
                  className="flex items-start gap-2.5 rounded-md border border-edge bg-surface-card p-2.5 text-left transition duration-[120ms] ease-out hover:bg-surface-hover"
                >
                  <Icon name={i.icon} size={16} color="var(--text-brand)" />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-content">{i.name}</span>
                    <span className="block text-2xs leading-normal text-content-muted">{i.sentence}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

/**
 * Test run: a read-only simulation. States plainly that nothing is sent or
 * changed. Persisting a TEST run + trace belongs with the execution work.
 */
export function TestRunDialog({
  open,
  onClose,
  steps,
}: {
  open: boolean;
  onClose: () => void;
  steps: FlowStep[];
}) {
  const [record, setRecord] = useState("Jahreslizenz Muster AG");
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!open) setDone(false);
  }, [open]);

  const flat: { step: FlowStep; lane?: string }[] = [];
  for (const s of steps) {
    flat.push({ step: s });
    if (s.kind === "BRANCH") (s.yes ?? []).forEach((x) => flat.push({ step: x, lane: "Ja" }));
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      width={560}
      title="Testlauf mit Beispieldatensatz"
      description="Der Testlauf liest echte Daten, verändert aber nichts. E-Mails werden nicht versendet."
      footer={
        done ? (
          <>
            <Button variant="secondary" onClick={onClose}>Schließen</Button>
            <Button iconLeft="rotate-ccw" onClick={() => setDone(false)}>Erneut testen</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>Abbrechen</Button>
            <Button iconLeft="flask-conical" onClick={() => setDone(true)}>Testlauf starten</Button>
          </>
        )
      }
    >
      <div className="mb-4 flex gap-3 rounded-md p-3" style={{ background: "var(--surface-success-subtle)" }}>
        <Icon name="shield-check" size={16} color="var(--text-success)" />
        <p className="text-xs leading-normal text-content">
          Simulation: keine E-Mails, keine Aufgaben, keine Änderungen an Datensätzen. Der Lauf erscheint im Protokoll als{" "}
          <strong>Testlauf</strong>.
        </p>
      </div>
      {!done ? (
        <Field label="Beispieldatensatz" hint="Kundeo zeigt, was mit diesem Deal passieren würde.">
          <Select
            value={record}
            onChange={(e) => setRecord(e.target.value)}
            options={["Jahreslizenz Muster AG", "Migration Weber GmbH", "Support-Vertrag Gruber KG", "Pilotprojekt Alpin AG"]}
          />
        </Field>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-content-muted">
            Ergebnis für <strong className="text-content">{record}</strong>
          </p>
          {flat.map(({ step, lane }, i) => {
            const last = i === flat.length - 1;
            return (
              <div key={step.id + i} className="flex items-start gap-3 rounded-md border border-edge bg-surface-page p-3">
                <Icon name={last ? "circle-dashed" : "circle-check"} size={16} color={last ? "var(--text-subtle)" : "var(--text-success)"} />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium text-content">{stepSentence(step.type, step.config)}</span>
                  <span className="mt-px block text-2xs text-content-muted">
                    {last ? "Würde übersprungen — Wartezeiten werden im Test nicht abgewartet" : "Würde ausgeführt"}
                  </span>
                </span>
                {lane ? <Badge tone="neutral">Pfad {lane}</Badge> : null}
              </div>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}
