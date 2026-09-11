"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { formatMoney } from "@/lib/format";

export interface CompanyRow {
  id: string;
  name: string;
  domain: string;
  industry: string;
  city: string;
  postalCode: string;
  country: string;
  vatId: string;
  contactCount: number;
  openDeals: number;
  volumeCents: number;
}

const COUNTRY_LABEL: Record<string, string> = { DE: "Deutschland", AT: "Österreich", CH: "Schweiz" };

const COLUMNS: DataTableColumn<CompanyRow>[] = [
  {
    key: "name",
    label: "Firma",
    render: (r) => (
      <span className="inline-flex items-center gap-[9px]">
        <Avatar name={r.name} size="sm" tone="neutral" />
        <span className="min-w-0">
          <span className="block font-medium text-content">{r.name}</span>
          {r.domain ? <span className="block font-mono text-2xs text-content-subtle">{r.domain}</span> : null}
        </span>
      </span>
    ),
  },
  { key: "industry", label: "Branche", muted: true, render: (r) => r.industry || "—" },
  {
    key: "city",
    label: "Ort",
    muted: true,
    render: (r) => (r.city ? `${[r.postalCode, r.city].filter(Boolean).join(" ")} · ${r.country}` : "—"),
  },
  { key: "vatId", label: "USt-IdNr.", mono: true, muted: true, render: (r) => r.vatId || "—" },
  { key: "contactCount", label: "Kontakte", align: "right", mono: true, render: (r) => String(r.contactCount) },
  {
    key: "openDeals",
    label: "Deals",
    align: "right",
    render: (r) => <Badge tone="brand">{r.openDeals} offen</Badge>,
  },
  {
    key: "volumeCents",
    label: "Volumen",
    align: "right",
    mono: true,
    render: (r) => formatMoney(r.volumeCents, "EUR"),
  },
];

export function CompaniesList({ rows }: { rows: CompanyRow[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("");

  const countryOptions = useMemo(
    () =>
      [...new Set(rows.map((r) => r.country).filter(Boolean))]
        .sort()
        .map((c) => ({ value: c, label: COUNTRY_LABEL[c] ?? c })),
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => r.name.toLowerCase().includes(needle) && (!country || r.country === country));
  }, [rows, q, country]);

  return (
    <>
      <div className="flex items-center gap-3">
        <Input
          size="sm"
          iconLeft="search"
          placeholder="Firmenname …"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          fullWidth={false}
          style={{ width: 240 }}
        />
        <Select
          size="sm"
          fullWidth={false}
          placeholder="Alle Länder"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          options={countryOptions}
          style={{ width: 160 }}
        />
        <span className="ml-auto font-mono text-xs tabular-nums text-content-muted">
          {filtered.length} von {rows.length}
        </span>
      </div>

      <Card padding="none">
        <DataTable
          selectable
          rows={filtered}
          columns={COLUMNS}
          onRowClick={(r) => router.push(`/companies/${r.id}`)}
          emptyState={
            <EmptyState
              icon="building-2"
              title="Keine Firmen gefunden"
              description="Passen Sie Suche oder Filter an, um weitere Firmen zu sehen."
            />
          }
        />
      </Card>
    </>
  );
}
