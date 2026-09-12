"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { Toast, type ToastProps } from "@/components/ui/toast";
import { formatMoney } from "@/lib/format";
import { ProductDrawer } from "@/components/products/product-drawer";
import { syncProduct, syncCatalog } from "@/app/(app)/products/actions";
import type { Option } from "@/lib/freefinance/types";

export interface ProductRow {
  id: string;
  name: string;
  sku: string;
  unit: string;
  unitPriceCents: number;
  currency: string;
  vatRate: number;
  account: string;
  description: string;
  active: boolean;
  synced: boolean;
  externalNumber: string;
}

export interface ProductPickers {
  accounts: Option[];
  vatRates: Option[];
  units: Option[];
}

const FILTERS = [
  { value: "", label: "Alle" },
  { value: "synced", label: "Synchronisiert" },
  { value: "unsynced", label: "Nicht synchronisiert" },
];

export function ProductsView({ rows, pickers, connected }: { rows: ProductRow[]; pickers: ProductPickers; connected: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<ProductRow | "new" | null>(null);
  const [toast, setToast] = useState<ToastProps | null>(null);
  const [pending, startTransition] = useTransition();

  function runSync(fn: () => Promise<{ ok: boolean; error?: string }>, ok: ToastProps) {
    startTransition(async () => {
      const res = await fn();
      setToast(res.ok ? ok : { tone: "danger", title: "Aktion fehlgeschlagen", description: res.error });
      if (res.ok) router.refresh();
    });
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (r.name.toLowerCase().includes(needle) || r.sku.toLowerCase().includes(needle)) &&
        (!filter || (filter === "synced" ? r.synced : !r.synced)),
    );
  }, [rows, q, filter]);

  const columns: DataTableColumn<ProductRow>[] = [
    {
      key: "name",
      label: "Name",
      render: (r) => (
        <span className="min-w-0">
          <span className="block font-medium text-content">{r.name}</span>
          {r.description ? <span className="block truncate text-2xs text-content-subtle">{r.description}</span> : null}
        </span>
      ),
    },
    { key: "sku", label: "Artikelnr.", mono: true, muted: true, render: (r) => r.sku || "—" },
    { key: "unit", label: "Einheit", muted: true, render: (r) => r.unit || "—" },
    { key: "unitPriceCents", label: "Preis netto", align: "right", mono: true, render: (r) => formatMoney(r.unitPriceCents, r.currency) },
    { key: "vatRate", label: "USt", align: "right", mono: true, render: (r) => `${r.vatRate} %` },
    { key: "account", label: "Konto", mono: true, muted: true, render: (r) => r.account || "Standard" },
    {
      key: "sync",
      label: "Sync-Status",
      render: (r) =>
        r.synced ? (
          <Badge tone="success" dot>
            Synchronisiert
          </Badge>
        ) : (
          <Badge tone="neutral" dot>
            Nicht synchronisiert
          </Badge>
        ),
    },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (r) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="ghost"
            iconLeft="refresh-cw"
            loading={pending}
            onClick={() => runSync(() => syncProduct(r.id), { tone: "success", title: "Produkt synchronisiert" })}
          >
            {r.synced ? "Erneut" : "Synchronisieren"}
          </Button>
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              iconLeft="refresh-cw"
              loading={pending}
              onClick={() =>
                runSync(async () => {
                  const res = await syncCatalog();
                  return res;
                }, { tone: "success", title: "Katalog synchronisiert" })
              }
            >
              Katalog synchronisieren
            </Button>
            <Button size="sm" iconLeft="plus" onClick={() => setEditing("new")}>
              Produkt anlegen
            </Button>
          </div>
        }
      />

      {!connected ? (
        <Card>
          <EmptyState
            icon="plug"
            title="FreeFinance ist nicht verbunden"
            description="Produkte, Angebote und Rechnungen stehen erst nach dem Hinterlegen der Zugangsdaten zur Verfügung."
            action={<Button size="sm" onClick={() => router.push("/settings")}>Integration einrichten</Button>}
          />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon="package"
            title="Noch keine Produkte"
            description="Legen Sie ein Produkt an oder übernehmen Sie den bestehenden Artikelstamm aus FreeFinance."
            action={<Button size="sm" iconLeft="plus" onClick={() => setEditing("new")}>Produkt anlegen</Button>}
          />
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <Input
              size="sm"
              iconLeft="search"
              placeholder="Produkt suchen …"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              fullWidth={false}
              style={{ width: 240 }}
            />
            <Select size="sm" fullWidth={false} value={filter} onChange={(e) => setFilter(e.target.value)} options={FILTERS} style={{ width: 200 }} />
            <span className="ml-auto font-mono text-xs tabular-nums text-content-muted">
              {filtered.length} von {rows.length}
            </span>
          </div>
          <Card padding="none">
            <DataTable rows={filtered} columns={columns} onRowClick={(r) => setEditing(r)} />
          </Card>
        </>
      )}

      {editing ? (
        <ProductDrawer
          product={editing === "new" ? null : editing}
          pickers={pickers}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setToast({ tone: "success", title: editing === "new" ? "Produkt angelegt" : "Produkt gespeichert" });
            router.refresh();
          }}
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
