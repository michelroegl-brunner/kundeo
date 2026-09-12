"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { createProduct, updateProduct } from "@/app/(app)/products/actions";
import type { ProductRow, ProductPickers } from "@/components/products/products-view";

const CURRENCIES = [
  { value: "EUR", label: "Euro (EUR)" },
  { value: "CHF", label: "Schweizer Franken (CHF)" },
];

function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function ProductDrawer({
  product,
  pickers,
  onClose,
  onSaved,
}: {
  product: ProductRow | null;
  pickers: ProductPickers;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = product !== null;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(product?.active ?? true);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("active", active ? "on" : "");
    startTransition(async () => {
      try {
        if (isEdit && product) await updateProduct(product.id, fd);
        else await createProduct(fd);
        onSaved();
      } catch {
        setError("Speichern fehlgeschlagen. Bitte erneut versuchen.");
      }
    });
  }

  const accountOptions = [{ value: "", label: "Standard-Erlöskonto" }, ...pickers.accounts];
  const vatOptions = pickers.vatRates.length ? pickers.vatRates : [{ value: String(product?.vatRate ?? 20), label: `${product?.vatRate ?? 20} %` }];

  return (
    <Dialog open title={isEdit ? "Produkt bearbeiten" : "Produkt anlegen"} description="Grundlage für Angebots- und Rechnungszeilen." width={620} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-[1fr_180px] gap-3">
          <Field label="Name" required>
            <Input name="name" required defaultValue={product?.name ?? ""} />
          </Field>
          <Field label="Artikelnr.">
            <Input name="sku" mono defaultValue={product?.sku ?? ""} placeholder="CONSULT-1" />
          </Field>
        </div>

        <Field label="Beschreibung">
          <Textarea name="description" rows={2} defaultValue={product?.description ?? ""} />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Preis netto">
            <Input name="price" mono align="right" defaultValue={product ? centsToInput(product.unitPriceCents) : ""} placeholder="0,00" />
          </Field>
          <Field label="Währung">
            <Select name="currency" defaultValue={product?.currency ?? "EUR"} options={CURRENCIES} />
          </Field>
          <Field label="USt-Satz">
            <Select name="vatRate" defaultValue={String(product?.vatRate ?? 20)} options={vatOptions} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Einheit">
            {pickers.units.length ? (
              <Select name="unit" defaultValue={product?.unit ?? ""} options={[{ value: "", label: "—" }, ...pickers.units]} />
            ) : (
              <Input name="unit" defaultValue={product?.unit ?? ""} placeholder="z. B. H, STK" />
            )}
          </Field>
          <Field label="Erlöskonto" hint="Leer = Standard aus den Einstellungen">
            {pickers.accounts.length ? (
              <Select name="account" defaultValue={product?.account ?? ""} options={accountOptions} />
            ) : (
              <Input name="account" mono defaultValue={product?.account ?? ""} placeholder="Standard" />
            )}
          </Field>
        </div>

        <Checkbox label="Aktiv — im Angebots-Picker verfügbar" checked={active} onChange={setActive} />

        {error ? <p className="font-sans text-xs text-danger">{error}</p> : null}

        <div className="-mx-5 -mb-5 mt-1 flex justify-end gap-2 border-t border-edge-subtle bg-surface-page px-5 py-4">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={pending}>
            Abbrechen
          </Button>
          <Button type="submit" size="sm" loading={pending}>
            {isEdit ? "Speichern und synchronisieren" : "Anlegen"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
