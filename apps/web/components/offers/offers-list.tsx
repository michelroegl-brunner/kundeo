"use client";

import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { formatMoney, formatDate } from "@/lib/format";

export interface OfferRow {
  id: string;
  number: string;
  customer: string;
  date: string;
  expirationDate: string;
  totalCents: number;
  currency: string;
  status: string;
}

function statusBadge(row: OfferRow) {
  if (row.status === "CANCELLED") return <Badge tone="danger">Storniert</Badge>;
  if (row.status === "FINALIZED") {
    if (row.expirationDate && new Date(row.expirationDate) < new Date()) return <Badge tone="warning">Abgelaufen</Badge>;
    return <Badge tone="success">Finalisiert</Badge>;
  }
  return <Badge tone="neutral">Entwurf</Badge>;
}

export function OffersList({ rows }: { rows: OfferRow[] }) {
  const router = useRouter();

  const columns: DataTableColumn<OfferRow>[] = [
    { key: "number", label: "Nummer", mono: true, render: (r) => r.number || "—" },
    { key: "customer", label: "Kunde", render: (r) => r.customer },
    { key: "date", label: "Datum", mono: true, muted: true, render: (r) => (r.date ? formatDate(new Date(r.date)) : "—") },
    { key: "expirationDate", label: "Gültig bis", mono: true, muted: true, render: (r) => (r.expirationDate ? formatDate(new Date(r.expirationDate)) : "—") },
    { key: "totalCents", label: "Gesamt", align: "right", mono: true, render: (r) => formatMoney(r.totalCents, r.currency) },
    { key: "status", label: "Status", align: "right", render: statusBadge },
  ];

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="file-text"
          title="Noch keine Angebote"
          description="Erstellen Sie ein Angebot aus dem Produktkatalog und übertragen Sie es an FreeFinance."
          action={<Button size="sm" iconLeft="plus" onClick={() => router.push("/offers/new")}>Angebot erstellen</Button>}
        />
      </Card>
    );
  }

  return (
    <Card padding="none">
      <DataTable rows={rows} columns={columns} onRowClick={(r) => router.push(`/offers/${r.id}`)} />
    </Card>
  );
}
