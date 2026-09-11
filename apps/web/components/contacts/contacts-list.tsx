"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Avatar } from "@/components/ui/avatar";
import { Tag } from "@/components/ui/tag";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";

export interface ContactRow {
  id: string;
  title: string | null;
  firstName: string;
  lastName: string;
  position: string;
  company: string;
  city: string;
  country: string;
  email: string;
  ownerName: string;
  isMine: boolean;
  isNew: boolean;
  tags: { id: string; name: string; color: string }[];
}

const COUNTRY_LABEL: Record<string, string> = { DE: "Deutschland", AT: "Österreich", CH: "Schweiz" };

const COLUMNS: DataTableColumn<ContactRow>[] = [
  {
    key: "name",
    label: "Name",
    render: (r) => (
      <span className="inline-flex items-center gap-[9px]">
        <Avatar name={`${r.firstName} ${r.lastName}`} size="sm" />
        <span className="min-w-0">
          <span className="block font-medium text-content">
            {[r.title, r.firstName, r.lastName].filter(Boolean).join(" ")}
          </span>
          {r.position ? <span className="block text-2xs text-content-subtle">{r.position}</span> : null}
        </span>
      </span>
    ),
  },
  { key: "company", label: "Firma", muted: true, render: (r) => r.company || "—" },
  {
    key: "city",
    label: "Ort",
    muted: true,
    render: (r) => (r.city ? `${r.city} · ${r.country}` : "—"),
  },
  { key: "email", label: "E-Mail", muted: true, mono: true, render: (r) => r.email || "—" },
  {
    key: "tags",
    label: "Tags",
    render: (r) =>
      r.tags.length ? (
        <span className="inline-flex flex-wrap gap-1.5">
          {r.tags.map((t) => (
            <Tag key={t.id} color={t.color}>
              {t.name}
            </Tag>
          ))}
        </span>
      ) : (
        <span className="text-content-subtle">—</span>
      ),
  },
  {
    key: "owner",
    label: "Inhaber",
    width: 80,
    render: (r) => (r.ownerName ? <Avatar name={r.ownerName} size="xs" tone="neutral" /> : "—"),
  },
];

export function ContactsList({ rows }: { rows: ContactRow[] }) {
  const router = useRouter();
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("");

  const countryOptions = useMemo(
    () =>
      [...new Set(rows.map((r) => r.country).filter(Boolean))]
        .sort()
        .map((c) => ({ value: c, label: COUNTRY_LABEL[c] ?? c })),
    [rows],
  );

  const tabbed = useMemo(() => {
    if (tab === "mine") return rows.filter((r) => r.isMine);
    if (tab === "new") return rows.filter((r) => r.isNew);
    return rows;
  }, [rows, tab]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tabbed.filter((r) => {
      const hay = `${r.firstName} ${r.lastName} ${r.company}`.toLowerCase();
      return hay.includes(needle) && (!country || r.country === country);
    });
  }, [tabbed, q, country]);

  const tabs = [
    { id: "all", label: "Alle", icon: "users", count: rows.length },
    { id: "mine", label: "Meine", icon: "user", count: rows.filter((r) => r.isMine).length },
    { id: "new", label: "Neu diese Woche", icon: "sparkles", count: rows.filter((r) => r.isNew).length },
  ];

  return (
    <>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      <div className="flex items-center gap-3">
        <Input
          size="sm"
          iconLeft="search"
          placeholder="Name oder Firma …"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          fullWidth={false}
          style={{ width: 260 }}
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
          onRowClick={(r) => router.push(`/contacts/${r.id}`)}
          emptyState={
            <EmptyState
              icon="users"
              title="Keine Kontakte gefunden"
              description="Passen Sie Suche oder Filter an, um weitere Kontakte zu sehen."
            />
          }
        />
      </Card>
    </>
  );
}
