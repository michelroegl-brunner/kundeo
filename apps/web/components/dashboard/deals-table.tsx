"use client";

import { useRouter } from "next/navigation";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { formatMoney } from "@/lib/format";

export interface DashboardDealRow {
  id: string;
  title: string;
  company: string;
  stage: string;
  ownerName: string;
  amountCents: number;
  currency: string;
}

const COLUMNS: DataTableColumn<DashboardDealRow>[] = [
  { key: "title", label: "Deal", render: (r) => <span className="font-medium">{r.title}</span> },
  { key: "company", label: "Firma", muted: true, render: (r) => r.company || "—" },
  {
    key: "stage",
    label: "Phase",
    render: (r) => (r.stage ? <Badge tone="brand" dot>{r.stage}</Badge> : "—"),
  },
  {
    key: "owner",
    label: "Inhaber",
    width: 70,
    render: (r) => (r.ownerName ? <Avatar name={r.ownerName} size="xs" /> : "—"),
  },
  {
    key: "amount",
    label: "Betrag",
    align: "right",
    mono: true,
    render: (r) => formatMoney(r.amountCents, r.currency),
  },
];

export function DashboardDealsTable({ rows }: { rows: DashboardDealRow[] }) {
  const router = useRouter();
  return (
    <DataTable
      rows={rows}
      columns={COLUMNS}
      onRowClick={() => router.push("/deals")}
      emptyState={
        <EmptyState
          icon="kanban"
          title="Noch keine offenen Deals"
          description="Sobald Deals in der Pipeline liegen, erscheinen sie hier."
          compact
        />
      }
    />
  );
}
