"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog } from "@/components/ui/dialog";
import { Toast, type ToastProps } from "@/components/ui/toast";
import { formatMoney, formatDate } from "@/lib/format";
import { createInvoiceFromOffer } from "@/app/(app)/offers/document-actions";

export interface InvoiceRow {
  id: string;
  number: string;
  customer: string;
  date: string;
  dueDate: string;
  totalCents: number;
  currency: string;
  status: string;
  paymentStatus: string;
  overdue: boolean;
  dunningLevel: number;
  dunningLabel: string;
}
export interface InvoiceKpis {
  openCents: number;
  overdueCents: number;
  paid30Cents: number;
  drafts: number;
}
export interface ConvertibleOffer {
  id: string;
  number: string;
  customer: string;
  totalCents: number;
  currency: string;
}

function paymentBadge(r: InvoiceRow) {
  if (r.status === "CANCELLED") return <Badge tone="danger">Storniert</Badge>;
  if (r.status === "DRAFT") return <Badge tone="neutral">Entwurf</Badge>;
  if (r.overdue) return <Badge tone="danger">Überfällig</Badge>;
  if (r.paymentStatus === "PAID") return <Badge tone="success">Bezahlt</Badge>;
  if (r.paymentStatus === "PARTIAL") return <Badge tone="warning">Teilweise</Badge>;
  return <Badge tone="neutral">Offen</Badge>;
}

export function InvoicesView({ rows, kpis, convertible }: { rows: InvoiceRow[]; kpis: InvoiceKpis; convertible: ConvertibleOffer[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<ToastProps | null>(null);

  const columns: DataTableColumn<InvoiceRow>[] = [
    { key: "number", label: "Nummer", mono: true, render: (r) => r.number || "—" },
    { key: "customer", label: "Kunde", render: (r) => r.customer },
    { key: "date", label: "Datum", mono: true, muted: true, render: (r) => (r.date ? formatDate(new Date(r.date)) : "—") },
    {
      key: "dueDate",
      label: "Fälligkeit",
      mono: true,
      render: (r) => (r.dueDate ? <span className={r.overdue ? "text-danger" : "text-content-muted"}>{formatDate(new Date(r.dueDate))}</span> : "—"),
    },
    { key: "totalCents", label: "Gesamt", align: "right", mono: true, render: (r) => formatMoney(r.totalCents, r.currency) },
    {
      key: "dunningLevel",
      label: "Mahnstufe",
      align: "right",
      render: (r) => (r.dunningLevel > 0 ? <Badge tone="warning">{r.dunningLabel || `Stufe ${r.dunningLevel}`}</Badge> : <span className="text-content-subtle">—</span>),
    },
    { key: "paymentStatus", label: "Zahlstatus", align: "right", render: paymentBadge },
  ];

  return (
    <>
      <PageHeader
        actions={
          <Button size="sm" iconLeft="plus" onClick={() => setCreating(true)}>
            Rechnung erstellen
          </Button>
        }
      />

      <div className="grid grid-cols-4 gap-3 max-md:grid-cols-2">
        <StatTile label="Offen" value={formatMoney(kpis.openCents, "EUR")} tone="neutral" icon="receipt" />
        <StatTile label="Überfällig" value={formatMoney(kpis.overdueCents, "EUR")} tone={kpis.overdueCents > 0 ? "warning" : "neutral"} icon="triangle-alert" />
        <StatTile label="Bezahlt (30 Tage)" value={formatMoney(kpis.paid30Cents, "EUR")} tone="success" icon="circle-check" />
        <StatTile label="Entwürfe" value={String(kpis.drafts)} tone="neutral" icon="file-text" />
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon="receipt"
            title="Noch keine Rechnungen"
            description="Rechnungen entstehen aus einem Deal oder einem angenommenen Angebot."
            action={convertible.length ? <Button size="sm" iconLeft="plus" onClick={() => setCreating(true)}>Rechnung erstellen</Button> : undefined}
          />
        </Card>
      ) : (
        <Card padding="none">
          <DataTable rows={rows} columns={columns} onRowClick={(r) => router.push(`/invoices/${r.id}`)} />
        </Card>
      )}

      {creating ? (
        <ConvertDialog offers={convertible} onClose={() => setCreating(false)} onError={(e) => setToast({ tone: "danger", title: "Aktion fehlgeschlagen", description: e })} />
      ) : null}

      {toast ? (
        <div className="fixed bottom-6 right-6 z-[70]">
          <Toast {...toast} onClose={() => setToast(null)} />
        </div>
      ) : null}
    </>
  );
}

function ConvertDialog({ offers, onClose, onError }: { offers: ConvertibleOffer[]; onClose: () => void; onError: (e: string) => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function convert(id: string) {
    startTransition(async () => {
      const res = await createInvoiceFromOffer(id, { finalize: true });
      if (res.ok && res.id) router.push(`/invoices/${res.id}`);
      else onError(res.error ?? "Rechnung konnte nicht erstellt werden.");
    });
  }

  return (
    <Dialog open title="Rechnung erstellen" description="Aus einem angenommenen Angebot erzeugt." width={560} onClose={onClose}>
      {offers.length === 0 ? (
        <EmptyState icon="file-text" title="Keine finalisierten Angebote" description="Finalisieren Sie zuerst ein Angebot, um daraus eine Rechnung zu erzeugen." compact />
      ) : (
        <div className="flex flex-col">
          {offers.map((o) => (
            <button
              key={o.id}
              type="button"
              disabled={pending}
              onClick={() => convert(o.id)}
              className="flex items-center gap-3 rounded-md px-2 py-2 text-left transition hover:bg-surface-hover disabled:opacity-60"
            >
              <span className="font-mono text-xs text-content">{o.number || "—"}</span>
              <span className="min-w-0 flex-1 truncate font-sans text-sm text-content">{o.customer}</span>
              <span className="font-mono text-xs text-content">{formatMoney(o.totalCents, o.currency)}</span>
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}
