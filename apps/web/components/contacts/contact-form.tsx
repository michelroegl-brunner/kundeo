"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export interface ContactInitial {
  salutation?: string | null;
  title?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  position?: string | null;
  companyId?: string | null;
  notes?: string | null;
}

export interface ContactFormDialogProps {
  /** Server action; receives the form's FormData. Redirects on success. */
  action: (formData: FormData) => void | Promise<void>;
  companies: { id: string; name: string }[];
  initial?: ContactInitial;
  triggerLabel?: string;
  triggerIcon?: string;
  triggerVariant?: "primary" | "secondary" | "ghost";
  triggerSize?: "sm" | "md";
  title?: string;
  submitLabel?: string;
}

export function ContactFormDialog({
  action,
  companies,
  initial,
  triggerLabel = "Kontakt anlegen",
  triggerIcon = "plus",
  triggerVariant = "primary",
  triggerSize = "sm",
  title = "Kontakt anlegen",
  submitLabel = "Anlegen",
}: ContactFormDialogProps) {
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
      <Dialog open={open} title={title} description="Stammdaten des Kontakts." width={680} onClose={() => setOpen(false)}>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-[120px_1fr] gap-3">
            <Field label="Anrede">
              <Select
                name="salutation"
                defaultValue={initial?.salutation ?? ""}
                placeholder="—"
                options={["Herr", "Frau"]}
              />
            </Field>
            <Field label="Titel">
              <Input name="title" defaultValue={initial?.title ?? ""} placeholder="z. B. Dr." />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Vorname" required>
              <Input name="firstName" required defaultValue={initial?.firstName ?? ""} />
            </Field>
            <Field label="Nachname" required>
              <Input name="lastName" required defaultValue={initial?.lastName ?? ""} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="E-Mail">
              <Input name="email" type="email" defaultValue={initial?.email ?? ""} />
            </Field>
            <Field label="Telefon">
              <Input name="phone" defaultValue={initial?.phone ?? ""} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Position">
              <Input name="position" defaultValue={initial?.position ?? ""} placeholder="z. B. Einkaufsleitung" />
            </Field>
            <Field label="Firma">
              <Select
                name="companyId"
                defaultValue={initial?.companyId ?? ""}
                placeholder="—"
                options={companies.map((c) => ({ value: c.id, label: c.name }))}
              />
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
