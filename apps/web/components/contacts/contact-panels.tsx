"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs } from "@/components/ui/tabs";
import { Field } from "@/components/ui/field";
import { ActivityItem } from "@/components/ui/activity-item";
import { DealCard } from "@/components/ui/deal-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Toast } from "@/components/ui/toast";
import { addActivity, type ActivityKind } from "@/app/(app)/contacts/[id]/actions";

export interface PanelActivity {
  id: string;
  type: ActivityKind;
  subject: string;
  body?: string;
  author?: string;
  timestamp: string;
}

export interface PanelDeal {
  id: string;
  title: string;
  company: string;
  amountCents: number;
  currency: "EUR" | "CHF";
  owner?: string;
  dueLabel?: string;
  overdue: boolean;
}

export interface ContactMasterData {
  salutation: string;
  title: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  position: string;
}

export interface ContactPanelsProps {
  contactId: string;
  activities: PanelActivity[];
  deals: PanelDeal[];
  master: ContactMasterData;
}

const TYPE_OPTIONS = [
  { value: "NOTE", label: "Notiz" },
  { value: "CALL", label: "Anruf" },
  { value: "EMAIL", label: "E-Mail" },
  { value: "MEETING", label: "Termin" },
  { value: "TASK", label: "Aufgabe" },
];

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <Field label={label}>
      <span className="font-sans text-sm text-content">{value || "—"}</span>
    </Field>
  );
}

export function ContactPanels({ contactId, activities, deals, master }: ContactPanelsProps) {
  const router = useRouter();
  const [tab, setTab] = useState("activities");
  const [note, setNote] = useState("");
  const [type, setType] = useState<ActivityKind>("NOTE");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    const subject = note.trim();
    if (!subject) return;
    startTransition(async () => {
      try {
        await addActivity(contactId, type, subject);
        setNote("");
        router.refresh();
      } catch {
        setError("Aktivität konnte nicht gespeichert werden.");
      }
    });
  }

  const tabs = [
    { id: "activities", label: "Aktivitäten", icon: "activity", count: activities.length },
    { id: "deals", label: "Deals", icon: "kanban", count: deals.length },
    { id: "fields", label: "Stammdaten", icon: "id-card" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === "activities" ? (
        <>
          <Card>
            <Textarea
              rows={2}
              placeholder="Notiz, Anruf oder Termin erfassen …"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="mt-3 flex items-center gap-2">
              <Select
                size="sm"
                fullWidth={false}
                value={type}
                onChange={(e) => setType(e.target.value as ActivityKind)}
                options={TYPE_OPTIONS}
                style={{ width: 130 }}
              />
              <Button size="sm" disabled={!note.trim()} loading={pending} onClick={save}>
                Speichern
              </Button>
            </div>
          </Card>

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
                description="Erfassen Sie oben die erste Notiz oder Aktivität."
              />
            )}
          </Card>
        </>
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
            <EmptyState
              compact
              icon="kanban"
              title="Keine Deals"
              description="Diesem Kontakt ist noch kein Deal zugeordnet."
            />
          </Card>
        )
      ) : (
        <Card title="Stammdaten" subtitle="DACH-Felder aus dem Datenmodell">
          <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
            <InfoRow label="Anrede" value={master.salutation} />
            <InfoRow label="Titel" value={master.title} />
            <InfoRow label="Vorname" value={master.firstName} />
            <InfoRow label="Nachname" value={master.lastName} />
            <InfoRow label="E-Mail" value={master.email} />
            <InfoRow label="Telefon" value={master.phone} />
            <InfoRow label="Position" value={master.position} />
          </div>
        </Card>
      )}

      {error ? (
        <div className="fixed bottom-6 right-6 z-50">
          <Toast tone="danger" title="Speichern fehlgeschlagen" description={error} onClose={() => setError(null)} />
        </div>
      ) : null}
    </div>
  );
}
