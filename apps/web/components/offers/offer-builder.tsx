"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { Toast, type ToastProps } from "@/components/ui/toast";
import { ItemPicker, type PickedLine } from "@/components/offers/item-picker";
import { FinalizeDialog } from "@/components/offers/finalize-dialog";
import { documentTotals, lineTotals, type DiscountMode } from "@/lib/freefinance/totals";
import { formatMoney } from "@/lib/format";
import { saveOfferDraft, finalizeOffer, type OfferPayload, type OfferLineInput } from "@/app/(app)/offers/actions";
import type { Option } from "@/lib/freefinance/types";

export interface BuilderProduct {
  id: string;
  name: string;
  sku: string;
  unit: string;
  unitPriceCents: number;
  vatRate: number;
  account: string;
}

interface BuilderLine {
  key: string;
  productId?: string;
  name: string;
  itemNumber: string;
  unit: string;
  qtyStr: string;
  priceStr: string;
  discountStr: string;
  discountMode: DiscountMode;
  account: string;
  vatRate: number;
}

export interface OfferBuilderInitial {
  id: string;
  companyId: string;
  contactId: string;
  dealId: string;
  currency: string;
  issueDate: string;
  expirationDate: string;
  docDiscountValue: number | null;
  docDiscountMode: DiscountMode | null;
  lines: {
    productId?: string;
    type: "ITEM" | "TOTAL_DISCOUNT";
    name: string;
    itemNumber: string;
    quantity: number;
    unit: string;
    unitPriceCents: number;
    discountValue: number | null;
    discountMode: DiscountMode | null;
    account: string;
    vatRate: number;
  }[];
}

const num = (s: string): number => {
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const centsOf = (priceStr: string): number => Math.round(num(priceStr) * 100);
let keySeq = 0;
const nextKey = () => `l${keySeq++}`;

export function OfferBuilder({
  kind,
  initial,
  companies,
  products,
  accounts,
  vatRates,
  defaults,
  invoicing,
}: {
  kind: "OFFER" | "INVOICE";
  initial: OfferBuilderInitial | null;
  companies: { id: string; name: string }[];
  products: BuilderProduct[];
  accounts: Option[];
  vatRates: Option[];
  defaults: { account: string; vatRate: number; unit: string; eInvoice: string };
  invoicing: boolean;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  const [companyId, setCompanyId] = useState(initial?.companyId ?? "");
  const [issueDate, setIssueDate] = useState(initial?.issueDate ?? today);
  const [expirationDate, setExpirationDate] = useState(initial?.expirationDate ?? in30);
  const [currency, setCurrency] = useState(initial?.currency ?? "EUR");
  const [lines, setLines] = useState<BuilderLine[]>(
    (initial?.lines ?? [])
      .filter((l) => l.type === "ITEM")
      .map((l) => ({
        key: nextKey(),
        productId: l.productId,
        name: l.name,
        itemNumber: l.itemNumber,
        unit: l.unit,
        qtyStr: String(l.quantity),
        priceStr: (l.unitPriceCents / 100).toFixed(2),
        discountStr: l.discountValue != null ? String(l.discountValue) : "",
        discountMode: l.discountMode ?? "RATE",
        account: l.account,
        vatRate: l.vatRate,
      })),
  );
  const initDoc = initial?.lines.find((l) => l.type === "TOTAL_DISCOUNT");
  const [docDiscountStr, setDocDiscountStr] = useState(
    initial?.docDiscountValue != null ? String(initial.docDiscountValue) : initDoc?.discountValue != null ? String(initDoc.discountValue) : "",
  );
  const [docDiscountMode, setDocDiscountMode] = useState<DiscountMode>(initial?.docDiscountMode ?? initDoc?.discountMode ?? "RATE");

  const [picker, setPicker] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [toast, setToast] = useState<ToastProps | null>(null);
  const [pending, startTransition] = useTransition();

  const accountOptions = useMemo(() => [{ value: "", label: "Standard" }, ...accounts], [accounts]);

  const items = lines.map((l) => ({
    quantity: num(l.qtyStr),
    unitPriceCents: centsOf(l.priceStr),
    discountValue: l.discountStr ? num(l.discountStr) : null,
    discountMode: l.discountMode,
    vatRate: l.vatRate,
  }));
  const docDiscount = docDiscountStr ? { value: num(docDiscountStr), mode: docDiscountMode } : null;
  const totals = documentTotals(items, docDiscount);

  function addLine(picked?: PickedLine) {
    setLines((ls) => [
      ...ls,
      {
        key: nextKey(),
        productId: picked?.productId,
        name: picked?.name ?? "",
        itemNumber: picked?.itemNumber ?? "",
        unit: picked?.unit ?? defaults.unit,
        qtyStr: "1",
        priceStr: picked ? (picked.unitPriceCents / 100).toFixed(2) : "0.00",
        discountStr: "",
        discountMode: "RATE",
        account: "",
        vatRate: picked?.vatRate ?? defaults.vatRate,
      },
    ]);
  }
  const patch = (key: string, p: Partial<BuilderLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const removeLine = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));

  function buildPayload(): OfferPayload {
    const lineInputs: OfferLineInput[] = lines.map((l) => ({
      productId: l.productId ?? null,
      type: "ITEM",
      name: l.name,
      itemNumber: l.itemNumber || null,
      quantity: num(l.qtyStr),
      unit: l.unit || null,
      unitPriceCents: centsOf(l.priceStr),
      discountValue: l.discountStr ? num(l.discountStr) : null,
      discountMode: l.discountStr ? l.discountMode : null,
      account: l.account || null,
      vatRate: l.vatRate,
    }));
    return {
      id: initial?.id ?? null,
      kind,
      companyId: companyId || null,
      currency,
      issueDate,
      expirationDate: kind === "OFFER" ? expirationDate : null,
      docDiscountValue: docDiscountStr ? num(docDiscountStr) : null,
      docDiscountMode: docDiscountStr ? docDiscountMode : null,
      lines: lineInputs,
    };
  }

  const canSave = companyId !== "" && lines.length > 0;

  function saveDraft() {
    startTransition(async () => {
      const res = await saveOfferDraft(buildPayload());
      if (res.ok) {
        setToast({ tone: "success", title: "Angebot gespeichert" });
        if (!initial && res.id) router.replace(`/offers/${res.id}`);
        router.refresh();
      } else {
        setToast({ tone: "danger", title: "Aktion fehlgeschlagen", description: res.error });
      }
    });
  }

  function finalize(eInvoice: string) {
    startTransition(async () => {
      const res = await finalizeOffer(buildPayload(), { eInvoice });
      if (res.ok && res.id) {
        setFinalizeOpen(false);
        router.push(`/offers/${res.id}`);
      } else {
        setToast({ tone: "danger", title: "Der Beleg wurde nicht übertragen.", description: res.error });
      }
    });
  }

  return (
    <>
      <PageHeader
        breadcrumb={["Angebote", "Neu"]}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="neutral">Entwurf</Badge>
            <Button variant="secondary" size="sm" onClick={() => router.push("/offers")} disabled={pending}>
              Verwerfen
            </Button>
            <Button variant="secondary" size="sm" iconLeft="save" loading={pending} disabled={!canSave} onClick={saveDraft}>
              Als Entwurf speichern
            </Button>
            <Button size="sm" iconLeft="file-check" loading={pending} disabled={!canSave || !invoicing} onClick={() => setFinalizeOpen(true)}>
              Finalisieren &amp; PDF erzeugen
            </Button>
          </div>
        }
      />

      <Card title="Kopfdaten">
        <div className="grid grid-cols-[minmax(0,1.4fr)_140px_140px_120px] gap-3 max-md:grid-cols-1">
          <Field label="Kunde" required>
            <Select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              placeholder="Firma wählen …"
              options={companies.map((c) => ({ value: c.id, label: c.name }))}
            />
          </Field>
          <Field label="Datum">
            <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </Field>
          {kind === "OFFER" ? (
            <Field label="Gültig bis">
              <Input type="date" value={expirationDate} onChange={(e) => setExpirationDate(e.target.value)} />
            </Field>
          ) : (
            <div />
          )}
          <Field label="Währung">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)} options={[{ value: "EUR", label: "EUR" }, { value: "CHF", label: "CHF" }]} />
          </Field>
        </div>
      </Card>

      <Card
        title="Positionen"
        subtitle={`${lines.length} Positionen${docDiscountStr ? " + Gesamtrabatt" : ""}`}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" iconLeft="plus" onClick={() => setPicker(true)}>
              Position aus Katalog
            </Button>
            <Button size="sm" variant="ghost" iconLeft="file-plus" onClick={() => addLine()}>
              Freie Position
            </Button>
          </div>
        }
        padding="none"
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse font-sans text-sm">
            <thead>
              <tr className="border-b border-edge-subtle text-2xs uppercase tracking-wide text-content-subtle">
                <th className="px-3 py-2 text-left font-medium">Position</th>
                <th className="px-2 py-2 text-right font-medium">Menge</th>
                <th className="px-2 py-2 text-left font-medium">Einheit</th>
                <th className="px-2 py-2 text-right font-medium">Einzelpreis</th>
                <th className="px-2 py-2 text-right font-medium">Rabatt</th>
                <th className="px-2 py-2 text-left font-medium">Konto</th>
                <th className="px-2 py-2 text-right font-medium">USt</th>
                <th className="px-2 py-2 text-right font-medium">Netto</th>
                <th className="px-2 py-2 text-right font-medium">Gesamt</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const t = lineTotals({ quantity: num(l.qtyStr), unitPriceCents: centsOf(l.priceStr), discountValue: l.discountStr ? num(l.discountStr) : null, discountMode: l.discountMode, vatRate: l.vatRate });
                return (
                  <tr key={l.key} className="border-b border-edge-subtle align-middle">
                    <td className="px-3 py-2">
                      <Input size="sm" value={l.name} placeholder="Bezeichnung" onChange={(e) => patch(l.key, { name: e.target.value })} />
                    </td>
                    <td className="px-2 py-2">
                      <Input size="sm" mono align="right" value={l.qtyStr} onChange={(e) => patch(l.key, { qtyStr: e.target.value })} style={{ width: 64 }} fullWidth={false} />
                    </td>
                    <td className="px-2 py-2">
                      <Input size="sm" value={l.unit} onChange={(e) => patch(l.key, { unit: e.target.value })} style={{ width: 56 }} fullWidth={false} />
                    </td>
                    <td className="px-2 py-2">
                      <Input size="sm" mono align="right" value={l.priceStr} onChange={(e) => patch(l.key, { priceStr: e.target.value })} style={{ width: 96 }} fullWidth={false} />
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        <Input size="sm" mono align="right" value={l.discountStr} placeholder="0" onChange={(e) => patch(l.key, { discountStr: e.target.value })} style={{ width: 56 }} fullWidth={false} />
                        <ModeToggle mode={l.discountMode} onChange={(m) => patch(l.key, { discountMode: m })} />
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <Select size="sm" value={l.account} onChange={(e) => patch(l.key, { account: e.target.value })} options={accountOptions} style={{ width: 110 }} fullWidth={false} />
                    </td>
                    <td className="px-2 py-2">
                      <Select size="sm" value={String(l.vatRate)} onChange={(e) => patch(l.key, { vatRate: Number(e.target.value) })} options={vatRates} style={{ width: 72 }} fullWidth={false} />
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-xs tabular-nums text-content">{formatMoney(t.netCents, currency)}</td>
                    <td className="px-2 py-2 text-right font-mono text-xs tabular-nums text-content">{formatMoney(t.totalCents, currency)}</td>
                    <td className="px-2 py-2 text-right">
                      <button type="button" onClick={() => removeLine(l.key)} className="text-content-subtle transition hover:text-danger">
                        <Icon name="trash-2" size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center font-sans text-xs text-content-subtle">
                    Noch keine Positionen — „Position aus Katalog“ oder „Freie Position“.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-4 max-lg:grid-cols-1">
        <Card title="Gesamtrabatt" subtitle="TOTAL_DISCOUNT · auf die Zwischensumme">
          <div className="flex items-center gap-2">
            <Input mono align="right" value={docDiscountStr} placeholder="0" onChange={(e) => setDocDiscountStr(e.target.value)} style={{ width: 100 }} fullWidth={false} />
            <ModeToggle mode={docDiscountMode} onChange={setDocDiscountMode} />
            <span className="font-sans text-xs text-content-subtle">Optional — reduziert die Zwischensumme netto.</span>
          </div>
        </Card>

        <Card title="Summen">
          <div className="flex flex-col gap-0.5">
            <SumRow label="Zwischensumme netto" value={formatMoney(totals.subtotalNetCents, currency)} />
            {totals.discountCents > 0 ? <SumRow label="Gesamtrabatt" value={`− ${formatMoney(totals.discountCents, currency)}`} danger /> : null}
            <SumRow label="Netto" value={formatMoney(totals.netCents, currency)} />
            <SumRow label="USt" value={formatMoney(totals.taxCents, currency)} />
            <SumRow label="Gesamt" value={formatMoney(totals.totalCents, currency)} strong />
          </div>
          <div className="mt-3 flex items-center gap-1.5 rounded-md border border-edge-success bg-surface-success-subtle px-2.5 py-1.5">
            <Icon name="circle-check" size={13} color="var(--text-success)" />
            <span className="font-sans text-2xs text-content-secondary">Zeilensummen und Belegsummen stimmen überein</span>
          </div>
        </Card>
      </div>

      {picker ? (
        <ItemPicker
          products={products}
          onClose={() => setPicker(false)}
          onPick={(line) => {
            addLine(line);
            setPicker(false);
          }}
        />
      ) : null}

      {finalizeOpen ? (
        <FinalizeDialog
          kind={kind === "OFFER" ? "offer" : "invoice"}
          defaultEInvoice={defaults.eInvoice}
          pending={pending}
          onClose={() => setFinalizeOpen(false)}
          onConfirm={finalize}
        />
      ) : null}

      {toast ? (
        <div className="fixed bottom-6 right-6 z-[70]">
          <Toast {...toast} onClose={() => setToast(null)} />
        </div>
      ) : null}
    </>
  );
}

function ModeToggle({ mode, onChange }: { mode: DiscountMode; onChange: (m: DiscountMode) => void }) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-edge">
      {(["RATE", "CONSTANT"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={
            "px-1.5 py-1 font-sans text-2xs transition " +
            (mode === m ? "bg-surface-brand-subtle text-content-brand" : "bg-surface-card text-content-subtle hover:bg-surface-hover")
          }
        >
          {m === "RATE" ? "%" : "€"}
        </button>
      ))}
    </div>
  );
}

function SumRow({ label, value, strong, danger }: { label: string; value: string; strong?: boolean; danger?: boolean }) {
  return (
    <div className={"flex items-center justify-between py-0.5 " + (strong ? "mt-1 border-t border-edge-subtle pt-1.5" : "")}>
      <span className={"font-sans " + (strong ? "text-sm font-semibold text-content" : "text-xs text-content-secondary")}>{label}</span>
      <span
        className={
          "font-mono tabular-nums " +
          (danger ? "text-xs text-danger" : strong ? "text-sm font-semibold text-content" : "text-xs text-content")
        }
      >
        {value}
      </span>
    </div>
  );
}
