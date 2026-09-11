"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Avatar } from "@/components/ui/avatar";
import { Tabs } from "@/components/ui/tabs";
import { Field } from "@/components/ui/field";
import { ActivityItem } from "@/components/ui/activity-item";
import { DealCard } from "@/components/ui/deal-card";
import { EmptyState } from "@/components/ui/empty-state";

export interface CompanyContactRow {
  id: string;
  title: string | null;
  firstName: string;
  lastName: string;
  position: string;
  email: string;
  phone: string;
}

export interface CompanyDeal {
  id: string;
  title: string;
  company: string;
  amountCents: number;
  currency: "EUR" | "CHF";
  owner?: string;
  dueLabel?: string;
  overdue: boolean;
}

export interface CompanyActivity {
  id: string;
  type: "NOTE" | "CALL" | "EMAIL" | "MEETING" | "TASK";
  subject: string;
  body?: string;
  author?: string;
  timestamp: string;
}

export interface CompanyMasterData {
  name: string;
  industry: string;
  vatId: string;
  domain: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  phone: string;
}

const COUNTRY_LABEL: Record<string, string> = { DE: "Deutschland", AT: "Österreich", CH: "Schweiz" };

export interface CompanyPanelsProps {
  contacts: CompanyContactRow[];
  deals: CompanyDeal[];
  activities: CompanyActivity[];
  master: CompanyMasterData;
}

function InfoRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <span className="font-sans text-sm text-content">{value || "—"}</span>
    </Field>
  );
}

export function CompanyPanels({ contacts, deals, activities, master }: CompanyPanelsProps) {
  const router = useRouter();
  const [tab, setTab] = useState("contacts");

  const contactColumns: DataTableColumn<CompanyContactRow>[] = [
    {
      key: "name",
      label: "Name",
      render: (r) => (
        <span className="inline-flex items-center gap-[9px]">
          <Avatar name={`${r.firstName} ${r.lastName}`} size="xs" />
          <span className="font-medium text-content">
            {[r.title, r.firstName, r.lastName].filter(Boolean).join(" ")}
          </span>
        </span>
      ),
    },
    { key: "position", label: "Position", muted: true, render: (r) => r.position || "—" },
    { key: "email", label: "E-Mail", muted: true, mono: true, render: (r) => r.email || "—" },
    { key: "phone", label: "Telefon", muted: true, mono: true, render: (r) => r.phone || "—" },
  ];

  const tabs = [
    { id: "contacts", label: "Kontakte", icon: "users", count: contacts.length },
    { id: "deals", label: "Deals", icon: "kanban", count: deals.length },
    { id: "activities", label: "Aktivitäten", icon: "activity", count: activities.length },
    { id: "fields", label: "Stammdaten", icon: "id-card" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === "contacts" ? (
        <Card padding="none">
          <DataTable
            dense
            rows={contacts}
            columns={contactColumns}
            onRowClick={(r) => router.push(`/contacts/${r.id}`)}
            emptyState={
              <EmptyState
                compact
                icon="users"
                title="Noch keine Kontakte"
                description="Dieser Firma ist noch kein Ansprechpartner zugeordnet."
              />
            }
          />
        </Card>
      ) : tab === "deals" ? (
        deals.length ? (
          <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
            {deals.map((d) => (
              <DealCard
                key={d.id}
                title={d.title}
                company={d.company}
                amountCents={d.amountCents}
                currency={d.currency}
                owner={d.owner}
                dueLabel={d.dueLabel}
                overdue={d.overdue}
              />
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState compact icon="kanban" title="Keine Deals" description="Dieser Firma ist noch kein Deal zugeordnet." />
          </Card>
        )
      ) : tab === "activities" ? (
        <Card title="Verlauf">
          {activities.length ? (
            activities.map((a, i) => (
              <ActivityItem
                key={a.id}
                type={a.type}
                subject={a.subject}
                body={a.body}
                author={a.author}
                timestamp={a.timestamp}
                last={i === activities.length - 1}
              />
            ))
          ) : (
            <EmptyState
              compact
              icon="activity"
              title="Noch kein Verlauf"
              description="Aktivitäten zu Kontakten und Deals dieser Firma erscheinen hier."
            />
          )}
        </Card>
      ) : (
        <Card title="Stammdaten" subtitle="Firmendaten inkl. DACH-Felder">
          <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
            <InfoRow label="Firmenname" value={master.name} />
            <InfoRow label="Branche" value={master.industry} />
            <InfoRow label="USt-IdNr." value={master.vatId} hint="USt-IdNr. (DE), UID (AT), MWST-Nr. (CH)" />
            <InfoRow label="Domain" value={master.domain} />
            <div className="col-span-2 max-md:col-span-1">
              <InfoRow label="Straße" value={master.street} />
            </div>
            <InfoRow label="PLZ" value={master.postalCode} />
            <InfoRow label="Ort" value={master.city} />
            <InfoRow label="Land" value={COUNTRY_LABEL[master.country] ?? master.country} />
            <InfoRow label="Telefon" value={master.phone} />
          </div>
        </Card>
      )}
    </div>
  );
}
