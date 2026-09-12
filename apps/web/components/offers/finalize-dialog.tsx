"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

const EINVOICE_OPTIONS = [
  { value: "NONE", label: "Keine" },
  { value: "EB_V6_P1", label: "ebInterface 6.0" },
  { value: "X_RECHNUNG_V3_P0_UBL", label: "XRechnung 3.0" },
];

export function FinalizeDialog({
  kind,
  defaultEInvoice,
  pending,
  onClose,
  onConfirm,
}: {
  kind: "offer" | "invoice";
  defaultEInvoice: string;
  pending: boolean;
  onClose: () => void;
  onConfirm: (eInvoice: string) => void;
}) {
  const [eInvoice, setEInvoice] = useState(defaultEInvoice);
  const label = kind === "offer" ? "Angebot" : "Rechnung";

  return (
    <Dialog open title={`${label} finalisieren`} width={520} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-2 rounded-md border border-edge-warning bg-surface-warning-subtle px-3 py-2">
          <Icon name="triangle-alert" size={15} color="var(--text-warning)" />
          <p className="font-sans text-xs text-content-secondary">
            FreeFinance vergibt eine Belegnummer und erzeugt das PDF. Der Beleg ist danach nicht mehr änderbar und kann
            nur noch storniert werden. Positionen, Rabatte und Kunde sind anschließend gesperrt.
          </p>
        </div>
        <Field label="e-Rechnung">
          <Select value={eInvoice} onChange={(e) => setEInvoice(e.target.value)} options={EINVOICE_OPTIONS} />
        </Field>
        <div className="-mx-5 -mb-5 mt-1 flex justify-end gap-2 border-t border-edge-subtle bg-surface-page px-5 py-4">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={pending}>
            Abbrechen
          </Button>
          <Button size="sm" loading={pending} iconLeft="file-check" onClick={() => onConfirm(eInvoice)}>
            Finalisieren &amp; PDF erzeugen
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
