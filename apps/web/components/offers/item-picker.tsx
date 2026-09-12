"use client";

import { useState, useTransition } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { formatMoney } from "@/lib/format";
import { searchCatalogue, importCatalogueItem, type CatalogueItem } from "@/app/(app)/offers/actions";
import type { BuilderProduct } from "@/components/offers/offer-builder";

export interface PickedLine {
  productId?: string;
  name: string;
  itemNumber: string;
  unit: string;
  unitPriceCents: number;
  vatRate: number;
}

export function ItemPicker({
  products,
  onPick,
  onClose,
}: {
  products: BuilderProduct[];
  onPick: (line: PickedLine) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [ffItems, setFfItems] = useState<CatalogueItem[]>([]);
  const [searched, setSearched] = useState(false);
  const [pending, startTransition] = useTransition();
  const [importing, startImport] = useTransition();

  const needle = q.trim().toLowerCase();
  const kundeoMatches = products.filter((p) => p.name.toLowerCase().includes(needle) || p.sku.toLowerCase().includes(needle));

  function runSearch() {
    startTransition(async () => {
      const res = await searchCatalogue(q);
      setFfItems(res.ok ? res.items : []);
      setSearched(true);
    });
  }

  function pickKundeo(p: BuilderProduct) {
    onPick({ productId: p.id, name: p.name, itemNumber: p.sku, unit: p.unit, unitPriceCents: p.unitPriceCents, vatRate: p.vatRate });
  }

  function pickFf(item: CatalogueItem) {
    startImport(async () => {
      const res = await importCatalogueItem(item);
      onPick({
        productId: res.productId,
        name: item.name,
        itemNumber: item.itemNumber,
        unit: item.unit,
        unitPriceCents: item.unitPriceCents,
        vatRate: item.vatRate,
      });
    });
  }

  return (
    <Dialog open title="Position aus Katalog" description="Suche läuft gegen FreeFinance." width={640} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Input
            iconLeft="search"
            placeholder="Artikel suchen …"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            autoFocus
          />
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          <p className="mb-1 font-sans text-2xs font-medium uppercase tracking-wide text-content-subtle">Produkte in Kundeo</p>
          {kundeoMatches.length ? (
            <div className="mb-4 flex flex-col">
              {kundeoMatches.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pickKundeo(p)}
                  className="flex items-center gap-3 rounded-md px-2 py-2 text-left transition hover:bg-surface-hover"
                >
                  <Badge tone="success">Kundeo</Badge>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-sans text-sm text-content">{p.name}</span>
                    {p.sku ? <span className="block font-mono text-2xs text-content-subtle">{p.sku}</span> : null}
                  </span>
                  <span className="font-mono text-xs text-content">{formatMoney(p.unitPriceCents, "EUR")}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="mb-4 font-sans text-xs text-content-subtle">Keine passenden Produkte in Kundeo.</p>
          )}

          <div className="mb-1 flex items-center justify-between">
            <p className="font-sans text-2xs font-medium uppercase tracking-wide text-content-subtle">Nur in FreeFinance</p>
            <button type="button" onClick={runSearch} className="font-sans text-2xs text-content-brand hover:underline">
              {pending ? "Suche läuft …" : "Katalog durchsuchen"}
            </button>
          </div>
          {ffItems.length ? (
            <div className="flex flex-col">
              {ffItems.map((item) => (
                <button
                  key={item.externalId}
                  type="button"
                  disabled={importing}
                  onClick={() => pickFf(item)}
                  className="flex items-center gap-3 rounded-md px-2 py-2 text-left transition hover:bg-surface-hover disabled:opacity-60"
                >
                  <Badge tone="neutral">FreeFinance</Badge>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-sans text-sm text-content">{item.name}</span>
                    {item.itemNumber ? <span className="block font-mono text-2xs text-content-subtle">{item.itemNumber}</span> : null}
                  </span>
                  <span className="font-mono text-xs text-content">{formatMoney(item.unitPriceCents, "EUR")}</span>
                </button>
              ))}
            </div>
          ) : searched ? (
            <p className="font-sans text-xs text-content-subtle">Keine weiteren Artikel im Katalog gefunden.</p>
          ) : (
            <p className="font-sans text-xs text-content-subtle">
              <Icon name="search" size={12} className="mr-1 inline" /> „Katalog durchsuchen“, um Artikel aus FreeFinance zu laden.
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
