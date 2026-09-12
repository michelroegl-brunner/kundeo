"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Icon } from "@/components/ui/icon";
import type { RunFn } from "@/components/settings/settings-view";
import { saveDunningPolicy, type DunningPolicyInput } from "@/app/(app)/settings/dunning-actions";

export interface DunningLevelView {
  level: number;
  label: string;
  feeCents: number;
  interestBps: number;
  emailTemplateId: string | null;
}

export interface DunningPolicyView {
  isActive: boolean;
  graceDays: number;
  intervalDays: number;
  levels: DunningLevelView[];
}

export interface DunningTabProps {
  policy: DunningPolicyView;
  templates: { id: string; name: string }[];
  pending: boolean;
  run: RunFn;
}

const eurToCents = (v: string): number => Math.round((parseFloat(v.replace(",", ".")) || 0) * 100);
const centsToEur = (c: number): string => (c / 100).toFixed(2);
const pctToBps = (v: string): number => Math.round((parseFloat(v.replace(",", ".")) || 0) * 100);
const bpsToPct = (b: number): string => (b / 100).toFixed(2);

export function DunningTab({ policy, templates, pending, run }: DunningTabProps) {
  const [form, setForm] = useState<DunningPolicyView>(policy);
  const templateOptions = [{ value: "", label: "Standardtext" }, ...templates.map((t) => ({ value: t.id, label: t.name }))];

  const setLevel = (i: number, patch: Partial<DunningLevelView>) =>
    setForm((f) => ({ ...f, levels: f.levels.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }));

  const save = () => {
    const input: DunningPolicyInput = {
      isActive: form.isActive,
      graceDays: form.graceDays,
      intervalDays: form.intervalDays,
      levels: form.levels.map((l, i) => ({ ...l, level: i + 1 })),
    };
    run(() => saveDunningPolicy(input), { tone: "success", title: "Mahnrichtlinie gespeichert" });
  };

  return (
    <div className="flex flex-col gap-4">
      <Card
        title="Mahnwesen"
        subtitle="Fristen und Mahnstufen · Kundeo versendet Zahlungserinnerungen automatisch"
        actions={
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 font-sans text-xs text-content-secondary">
              Aktiv
              <Switch checked={form.isActive} onChange={(v) => setForm((f) => ({ ...f, isActive: v }))} />
            </label>
            <Button size="sm" loading={pending} onClick={save}>
              Speichern
            </Button>
          </div>
        }
      >
        <p className="mb-4 flex items-start gap-1.5 font-sans text-2xs text-content-subtle">
          <Icon name="info" size={13} />
          Der Mahnlauf prüft offene, finalisierte Rechnungen und verschickt die nächste Stufe per E-Mail (mit der
          Rechnung als Anhang). Zahlungseingänge aus FreeFinance stoppen den Lauf automatisch.
        </p>

        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field label="Karenzzeit (Tage)" hint="Wartezeit nach Fälligkeit bis zur 1. Stufe">
            <Input
              type="number"
              value={String(form.graceDays)}
              onChange={(e) => setForm((f) => ({ ...f, graceDays: Number(e.target.value) }))}
            />
          </Field>
          <Field label="Intervall (Tage)" hint="Abstand zwischen den weiteren Stufen">
            <Input
              type="number"
              value={String(form.intervalDays)}
              onChange={(e) => setForm((f) => ({ ...f, intervalDays: Number(e.target.value) }))}
            />
          </Field>
        </div>
      </Card>

      <Card title="Mahnstufen" subtitle="Bezeichnung, Mahngebühr, Verzugszinsen und E-Mail-Vorlage je Stufe">
        <div className="flex flex-col gap-3">
          {form.levels.map((l, i) => (
            <div key={i} className="rounded-md border border-edge bg-surface-card p-3">
              <div className="mb-2 font-sans text-2xs font-medium uppercase tracking-wide text-content-subtle">
                Stufe {i + 1}
              </div>
              <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
                <Field label="Bezeichnung">
                  <Input value={l.label} onChange={(e) => setLevel(i, { label: e.target.value })} />
                </Field>
                <Field label="Mahngebühr (€)">
                  <Input
                    type="number"
                    value={centsToEur(l.feeCents)}
                    onChange={(e) => setLevel(i, { feeCents: eurToCents(e.target.value) })}
                  />
                </Field>
                <Field label="Verzugszinsen (% p.a.)">
                  <Input
                    type="number"
                    value={bpsToPct(l.interestBps)}
                    onChange={(e) => setLevel(i, { interestBps: pctToBps(e.target.value) })}
                  />
                </Field>
                <Field label="E-Mail-Vorlage">
                  <Select
                    value={l.emailTemplateId ?? ""}
                    onChange={(e) => setLevel(i, { emailTemplateId: e.target.value || null })}
                    options={templateOptions}
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 font-sans text-2xs text-content-subtle">
          Nach der letzten Stufe wird keine weitere Mahnung erzeugt — die Rechnung bleibt zur manuellen Bearbeitung
          markiert (kein automatisches Inkasso).
        </p>
      </Card>
    </div>
  );
}
