"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export interface CompanyInitial {
  name?: string | null;
  domain?: string | null;
  industry?: string | null;
  vatId?: string | null;
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  website?: string | null;
  notes?: string | null;
}

const COUNTRIES = [
  { value: "DE", label: "Deutschland" },
  { value: "AT", label: "Österreich" },
  { value: "CH", label: "Schweiz" },
];

export interface CompanyFormDialogProps {
  action: (formData: FormData) => void | Promise<void>;
  initial?: CompanyInitial;
  triggerLabel?: string;
  triggerIcon?: string;
  triggerVariant?: "primary" | "secondary" | "ghost";
  triggerSize?: "sm" | "md";
  title?: string;
  submitLabel?: string;
}

export function CompanyFormDialog({
  action,
  initial,
  triggerLabel = "Firma anlegen",
  triggerIcon = "plus",
  triggerVariant = "primary",
  triggerSize = "sm",
  title = "Firma anlegen",
  submitLabel = "Anlegen",
}: CompanyFormDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await action(fd);
        setOpen(false);
        setError(null);
        router.refresh();
      } catch {
        setError("Speichern fehlgeschlagen. Bitte erneut versuchen.");
      }
    });
  }

  return (
    <>
      <Button size={triggerSize} variant={triggerVariant} iconLeft={triggerIcon} onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      <Dialog open={open} title={title} description="Stammdaten der Firma." width={680} onClose={() => setOpen(false)}>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" required>
              <Input name="name" required defaultValue={initial?.name ?? ""} />
            </Field>
            <Field label="Branche">
              <Input name="industry" defaultValue={initial?.industry ?? ""} placeholder="z. B. Maschinenbau" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Domain">
              <Input name="domain" defaultValue={initial?.domain ?? ""} placeholder="beispiel.de" />
            </Field>
            <Field label="Website">
              <Input name="website" defaultValue={initial?.website ?? ""} placeholder="https://…" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="USt-IdNr. / UID">
              <Input name="vatId" mono defaultValue={initial?.vatId ?? ""} placeholder="DE123456789" />
            </Field>
            <Field label="Telefon">
              <Input name="phone" defaultValue={initial?.phone ?? ""} />
            </Field>
          </div>

          <Field label="Straße">
            <Input name="street" defaultValue={initial?.street ?? ""} />
          </Field>

          <div className="grid grid-cols-[120px_1fr_140px] gap-3">
            <Field label="PLZ">
              <Input name="postalCode" mono defaultValue={initial?.postalCode ?? ""} />
            </Field>
            <Field label="Ort">
              <Input name="city" defaultValue={initial?.city ?? ""} />
            </Field>
            <Field label="Land">
              <Select name="country" defaultValue={initial?.country ?? "DE"} options={COUNTRIES} />
            </Field>
          </div>

          <Field label="Notizen">
            <Textarea name="notes" rows={4} defaultValue={initial?.notes ?? ""} />
          </Field>

          {error ? <p className="font-sans text-xs text-danger">{error}</p> : null}

          <div className="-mx-5 -mb-5 mt-1 flex justify-end gap-2 border-t border-edge-subtle bg-surface-page px-5 py-4">
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Abbrechen
            </Button>
            <Button type="submit" size="sm" loading={pending}>
              {submitLabel}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
