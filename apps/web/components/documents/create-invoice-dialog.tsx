"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { createInvoiceFromOffer } from "@/app/(app)/offers/document-actions";

export function CreateInvoiceDialog({ offerId, onDone }: { offerId: string; onDone?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [finalize, setFinalize] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createInvoiceFromOffer(offerId, { finalize });
      if (res.ok && res.id) {
        setOpen(false);
        onDone?.();
        router.push(`/invoices/${res.id}`);
      } else {
        setError(res.error ?? "Rechnung konnte nicht erstellt werden.");
      }
    });
  }

  return (
    <>
      <Button size="sm" variant="secondary" iconLeft="receipt" onClick={() => setOpen(true)}>
        In Rechnung umwandeln
      </Button>
      <Dialog open={open} title="Rechnung erstellen" description="Die Positionen werden aus dem Angebot übernommen." width={520} onClose={() => setOpen(false)}>
        <div className="flex flex-col gap-4">
          <p className="font-sans text-xs text-content-secondary">
            Die Rechnung wird mit denselben Positionen, Rabatten und dem Kunden angelegt. Positionen werden in FreeFinance
            bearbeitet, nicht in Kundeo.
          </p>
          <Checkbox
            label="Sofort finalisieren — vergibt die Belegnummer und erzeugt das PDF"
            hint="Ohne diese Option bleibt die Rechnung im Entwurf."
            checked={finalize}
            onChange={setFinalize}
          />
          {error ? <p className="font-sans text-xs text-danger">{error}</p> : null}
          <div className="-mx-5 -mb-5 mt-1 flex justify-end gap-2 border-t border-edge-subtle bg-surface-page px-5 py-4">
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Abbrechen
            </Button>
            <Button size="sm" loading={pending} onClick={submit}>
              Rechnung erstellen
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
