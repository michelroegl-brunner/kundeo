"use client";

import { useState, useTransition } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { sendDocument } from "@/app/(app)/offers/document-actions";

export function SendDialog({
  documentId,
  kind,
  templates,
  recipient,
  onClose,
  onSent,
}: {
  documentId: string;
  kind: "offer" | "invoice";
  templates: { id: string; name: string }[];
  recipient: string;
  onClose: () => void;
  onSent: (email: string) => void;
}) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [to, setTo] = useState(recipient);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filename = `${kind === "offer" ? "Angebot" : "Rechnung"}.pdf`;

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await sendDocument(documentId, { templateId: templateId || undefined, to });
      if (res.ok) onSent(to);
      else setError(res.error ?? "Beleg konnte nicht gesendet werden.");
    });
  }

  return (
    <Dialog open title={kind === "offer" ? "Angebot senden" : "Rechnung senden"} description="Der Beleg wird aus FreeFinance geladen und angehängt." width={560} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Field label="Vorlage" hint="Verwaltet unter Einstellungen › E-Mail-Vorlagen">
          <Select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            options={[{ value: "", label: "Ohne Vorlage" }, ...templates.map((t) => ({ value: t.id, label: t.name }))]}
          />
        </Field>
        <Field label="Empfänger" required>
          <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="kunde@example.at" />
        </Field>
        <Field label="Anhang">
          <div className="flex items-center gap-2 rounded-md border border-edge bg-surface-sunken px-3 py-2">
            <Icon name="paperclip" size={14} color="var(--text-subtle)" />
            <span className="font-mono text-xs text-content">{filename}</span>
            <span className="ml-auto font-sans text-2xs text-content-subtle">Wird beim Senden aus FreeFinance geladen und fest angehängt.</span>
          </div>
        </Field>
        {error ? <p className="font-sans text-xs text-danger">{error}</p> : null}
        <div className="-mx-5 -mb-5 mt-1 flex justify-end gap-2 border-t border-edge-subtle bg-surface-page px-5 py-4">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={pending}>
            Abbrechen
          </Button>
          <Button size="sm" loading={pending} disabled={!to.trim()} onClick={submit}>
            Senden
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
