"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { createDeal } from "@/app/(app)/deals/actions";
import { effortAmountCents, parseMoneyToCents, PERIOD_LABEL, type EffortPeriod } from "@/lib/deal-value";
import { formatMoney } from "@/lib/format";

export interface DealFormOptions {
  stages: { id: string; name: string }[];
  companies: { id: string; name: string }[];
  contacts: { id: string; name: string }[];
  owners: { id: string; name: string }[];
}

const EMPTY = {
  title: "",
  valueMode: "FIXED" as "FIXED" | "EFFORT",
  amount: "",
  currency: "EUR" as "EUR" | "CHF",
  hoursPerWeek: "",
  hourlyRate: "",
  effortPeriod: "MONTHLY" as EffortPeriod,
  stageId: "",
  companyId: "",
  contactId: "",
  ownerId: "",
  expectedCloseAt: "",
};

const PERIOD_OPTIONS = [
  { value: "WEEKLY", label: "pro Woche" },
  { value: "MONTHLY", label: "pro Monat" },
  { value: "ANNUAL", label: "pro Jahr" },
];

export function DealCreateDialog({ options }: { options: DealFormOptions }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function close() {
    setOpen(false);
    setForm(EMPTY);
    setError(null);
  }

  const previewCents = effortAmountCents({
    hoursPerWeek: Number(form.hoursPerWeek.replace(",", ".")),
    hourlyRateCents: parseMoneyToCents(form.hourlyRate),
    effortPeriod: form.effortPeriod,
  });

  function submit() {
    if (!form.title.trim()) {
      setError("Bitte einen Titel angeben.");
      return;
    }
    const fd = new FormData();
    fd.set("title", form.title);
    fd.set("valueMode", form.valueMode);
    fd.set("currency", form.currency);
    fd.set("amount", form.amount);
    fd.set("hoursPerWeek", form.hoursPerWeek);
    fd.set("hourlyRate", form.hourlyRate);
    fd.set("effortPeriod", form.effortPeriod);
    fd.set("stageId", form.stageId);
    fd.set("companyId", form.companyId);
    fd.set("contactId", form.contactId);
    fd.set("ownerId", form.ownerId);
    fd.set("expectedCloseAt", form.expectedCloseAt);
    startTransition(async () => {
      try {
        await createDeal(fd);
        close();
        router.refresh();
      } catch {
        setError("Deal konnte nicht angelegt werden.");
      }
    });
  }

  return (
    <>
      <Button size="sm" iconLeft="plus" onClick={() => setOpen(true)}>
        Deal anlegen
      </Button>
      <Dialog
        open={open}
        title="Deal anlegen"
        description="Neuer Deal in der Pipeline."
        width={680}
        onClose={close}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={close} disabled={pending}>
              Abbrechen
            </Button>
            <Button size="sm" loading={pending} onClick={submit}>
              Anlegen
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Titel" required error={error ?? undefined}>
            <Input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="z. B. Website-Relaunch"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Wertermittlung">
              <Select
                value={form.valueMode}
                onChange={(e) => set("valueMode", e.target.value as "FIXED" | "EFFORT")}
                options={[
                  { value: "FIXED", label: "Fester Betrag" },
                  { value: "EFFORT", label: "Aufwandsbasiert" },
                ]}
              />
            </Field>
            <Field label="Währung">
              <Select
                value={form.currency}
                onChange={(e) => set("currency", e.target.value as "EUR" | "CHF")}
                options={["EUR", "CHF"]}
              />
            </Field>
          </div>

          {form.valueMode === "FIXED" ? (
            <Field label="Betrag">
              <Input
                mono
                align="right"
                suffix={form.currency}
                value={form.amount}
                onChange={(e) => set("amount", e.target.value)}
                placeholder="0,00"
              />
            </Field>
          ) : (
            <div className="flex flex-col gap-3 rounded-md border border-edge-subtle bg-surface-sunken p-3">
              <div className="grid grid-cols-3 gap-3">
                <Field label="Stunden/Woche">
                  <Input
                    mono
                    align="right"
                    value={form.hoursPerWeek}
                    onChange={(e) => set("hoursPerWeek", e.target.value)}
                    placeholder="20"
                  />
                </Field>
                <Field label="Stundensatz">
                  <Input
                    mono
                    align="right"
                    suffix={form.currency}
                    value={form.hourlyRate}
                    onChange={(e) => set("hourlyRate", e.target.value)}
                    placeholder="90,00"
                  />
                </Field>
                <Field label="Zeitraum">
                  <Select
                    value={form.effortPeriod}
                    onChange={(e) => set("effortPeriod", e.target.value as EffortPeriod)}
                    options={PERIOD_OPTIONS}
                  />
                </Field>
              </div>
              <p className="font-sans text-xs text-content-muted">
                Dealwert{" "}
                <span className="font-mono font-medium text-content">
                  ≈ {formatMoney(previewCents, form.currency)}
                </span>{" "}
                {PERIOD_LABEL[form.effortPeriod]}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {options.stages.length ? (
              <Field label="Phase">
                <Select
                  value={form.stageId}
                  onChange={(e) => set("stageId", e.target.value)}
                  placeholder="Erste Phase"
                  options={options.stages.map((s) => ({ value: s.id, label: s.name }))}
                />
              </Field>
            ) : null}
            <Field label="Erwartetes Abschlussdatum">
              <Input
                type="date"
                value={form.expectedCloseAt}
                onChange={(e) => set("expectedCloseAt", e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Firma">
              <Select
                value={form.companyId}
                onChange={(e) => set("companyId", e.target.value)}
                placeholder="—"
                options={options.companies.map((c) => ({ value: c.id, label: c.name }))}
              />
            </Field>
            <Field label="Kontakt">
              <Select
                value={form.contactId}
                onChange={(e) => set("contactId", e.target.value)}
                placeholder="—"
                options={options.contacts.map((c) => ({ value: c.id, label: c.name }))}
              />
            </Field>
            <Field label="Inhaber">
              <Select
                value={form.ownerId}
                onChange={(e) => set("ownerId", e.target.value)}
                placeholder="—"
                options={options.owners.map((o) => ({ value: o.id, label: o.name }))}
              />
            </Field>
          </div>
        </div>
      </Dialog>
    </>
  );
}
