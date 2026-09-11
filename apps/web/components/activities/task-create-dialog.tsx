"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/app-shell";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { createTask } from "@/app/(app)/activities/actions";

export interface TaskCreateProps {
  contacts: { id: string; name: string }[];
  deals: { id: string; title: string }[];
}

/** Topbar "Aufgabe anlegen" action + dialog — always mounted (works when empty). */
export function TaskCreateDialog({ contacts, deals }: TaskCreateProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await createTask(fd);
        setOpen(false);
        setError(null);
        router.refresh();
      } catch {
        setError("Aufgabe konnte nicht angelegt werden.");
      }
    });
  }

  const action = (
    <Button size="sm" iconLeft="plus" onClick={() => setOpen(true)}>
      Aufgabe anlegen
    </Button>
  );

  return (
    <>
      <PageHeader actions={action} />
      <Dialog
        open={open}
        title="Aufgabe anlegen"
        description="Eine Aufgabe mit optionaler Fälligkeit und Verknüpfung."
        width={560}
        onClose={() => setOpen(false)}
      >
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Betreff" required>
            <Input name="subject" required placeholder="z. B. Angebot nachfassen" />
          </Field>

          <Field label="Fällig am">
            <Input name="dueAt" type="date" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Kontakt">
              <Select
                name="contactId"
                placeholder="—"
                options={contacts.map((c) => ({ value: c.id, label: c.name }))}
              />
            </Field>
            <Field label="Deal">
              <Select
                name="dealId"
                placeholder="—"
                options={deals.map((d) => ({ value: d.id, label: d.title }))}
              />
            </Field>
          </div>

          {error ? <p className="font-sans text-xs text-danger">{error}</p> : null}

          <div className="-mx-5 -mb-5 mt-1 flex justify-end gap-2 border-t border-edge-subtle bg-surface-page px-5 py-4">
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Abbrechen
            </Button>
            <Button type="submit" size="sm" loading={pending}>
              Anlegen
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
