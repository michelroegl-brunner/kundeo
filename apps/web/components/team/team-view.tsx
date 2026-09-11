"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Toast, type ToastProps } from "@/components/ui/toast";
import { inviteMember, revokeInvitation, updateMemberRole, removeMember } from "@/app/(app)/team/actions";

const ROLE_LABEL: Record<string, string> = { owner: "Inhaber", admin: "Administrator", member: "Mitglied" };
const ROLE_OPTIONS = [
  { value: "member", label: "Mitglied" },
  { value: "admin", label: "Administrator" },
  { value: "owner", label: "Inhaber" },
];

export interface MemberRow {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  deals: number;
  since: string;
}

export interface InvitationRow {
  id: string;
  email: string;
  role: string;
  expires: string;
}

export interface TeamViewProps {
  orgName: string;
  currentUserId: string;
  members: MemberRow[];
  invitations: InvitationRow[];
}

export function TeamView({ orgName, currentUserId, members, invitations }: TeamViewProps) {
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<ToastProps | null>(null);

  // Invite dialog
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");

  // Manage-member dialog
  const [managed, setManaged] = useState<MemberRow | null>(null);
  const [manageRole, setManageRole] = useState("member");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: ToastProps, after?: () => void) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setToast(ok);
        after?.();
      } else {
        setToast({ tone: "danger", title: "Aktion fehlgeschlagen", description: res.error });
      }
    });
  }

  const memberColumns: DataTableColumn<MemberRow>[] = [
    {
      key: "name",
      label: "Name",
      render: (r) => (
        <span className="inline-flex items-center gap-[9px]">
          <Avatar name={r.name} size="sm" />
          <span className="min-w-0">
            <span className="block font-medium text-content">{r.name}</span>
            <span className="block font-mono text-2xs text-content-subtle">{r.email}</span>
          </span>
        </span>
      ),
    },
    {
      key: "role",
      label: "Rolle",
      render: (r) => <Badge tone={r.role === "owner" ? "brand" : "neutral"}>{ROLE_LABEL[r.role] ?? r.role}</Badge>,
    },
    { key: "deals", label: "Deals", align: "right", mono: true, render: (r) => String(r.deals) },
    { key: "since", label: "Mitglied seit", mono: true, muted: true, render: (r) => r.since },
    {
      key: "actions",
      label: "",
      align: "right",
      width: 60,
      render: (r) => (
        <IconButton
          icon="ellipsis-vertical"
          label="Mitglied verwalten"
          size="sm"
          onClick={() => {
            setManaged(r);
            setManageRole(r.role);
          }}
        />
      ),
    },
  ];

  const invitationColumns: DataTableColumn<InvitationRow>[] = [
    { key: "email", label: "E-Mail", mono: true },
    { key: "role", label: "Rolle", render: (r) => <Badge tone="neutral">{ROLE_LABEL[r.role] ?? r.role}</Badge> },
    {
      key: "status",
      label: "Status",
      render: () => (
        <Badge tone="warning" dot>
          Ausstehend
        </Badge>
      ),
    },
    { key: "expires", label: "Läuft ab", mono: true, muted: true },
    {
      key: "actions",
      label: "",
      align: "right",
      width: 210,
      render: (r) => (
        <span className="inline-flex justify-end gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            iconLeft="send"
            onClick={() => run(() => inviteMember(r.email, r.role), { tone: "success", title: "Einladung erneut versendet", description: r.email })}
          >
            Erneut senden
          </Button>
          <Button
            size="sm"
            variant="ghost"
            iconLeft="x"
            onClick={() => run(() => revokeInvitation(r.id), { tone: "success", title: "Einladung zurückgezogen", description: r.email })}
          >
            Zurückziehen
          </Button>
        </span>
      ),
    },
  ];

  return (
    <>
      <Card
        padding="none"
        title="Mitglieder"
        subtitle={`Organisation „${orgName}“`}
        actions={
          <Button size="sm" iconLeft="user-plus" onClick={() => setInviteOpen(true)}>
            Mitglied einladen
          </Button>
        }
      >
        <DataTable rows={members} columns={memberColumns} />
      </Card>

      <Card padding="none" title="Offene Einladungen" subtitle="Better Auth · Organisation">
        {invitations.length ? (
          <DataTable dense rows={invitations} columns={invitationColumns} />
        ) : (
          <EmptyState
            compact
            icon="mail"
            title="Keine offenen Einladungen"
            description="Alle eingeladenen Personen haben die Einladung angenommen."
          />
        )}
      </Card>

      {/* Invite */}
      <Dialog
        open={inviteOpen}
        width={440}
        title="Mitglied einladen"
        description={`Die Einladung gilt für die Organisation „${orgName}“ und läuft nach sieben Tagen ab.`}
        onClose={() => setInviteOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setInviteOpen(false)}>
              Abbrechen
            </Button>
            <Button
              disabled={!email.includes("@")}
              loading={pending}
              onClick={() =>
                run(
                  () => inviteMember(email, inviteRole),
                  { tone: "success", title: "Einladung versendet", description: email },
                  () => {
                    setInviteOpen(false);
                    setEmail("");
                    setInviteRole("member");
                  },
                )
              }
            >
              Einladen
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="E-Mail" required>
            <Input type="email" iconLeft="mail" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@firma.de" />
          </Field>
          <Field label="Rolle" hint="Inhaber können Organisation und Mitglieder verwalten.">
            <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} options={ROLE_OPTIONS} />
          </Field>
        </div>
      </Dialog>

      {/* Manage member */}
      <Dialog
        open={managed != null}
        width={440}
        title="Mitglied verwalten"
        description={managed ? `${managed.name} · ${managed.email}` : undefined}
        onClose={() => setManaged(null)}
        footer={
          <>
            <Button
              variant="danger"
              iconLeft="user-minus"
              disabled={!managed || managed.userId === currentUserId}
              onClick={() =>
                managed &&
                run(
                  () => removeMember(managed.id),
                  { tone: "success", title: "Mitglied entfernt", description: managed.email },
                  () => setManaged(null),
                )
              }
            >
              Entfernen
            </Button>
            <span className="flex-1" />
            <Button variant="secondary" onClick={() => setManaged(null)}>
              Abbrechen
            </Button>
            <Button
              loading={pending}
              disabled={!managed || manageRole === managed.role}
              onClick={() =>
                managed &&
                run(
                  () => updateMemberRole(managed.id, manageRole),
                  { tone: "success", title: "Rolle geändert", description: `${managed.name}: ${ROLE_LABEL[manageRole] ?? manageRole}` },
                  () => setManaged(null),
                )
              }
            >
              Speichern
            </Button>
          </>
        }
      >
        <Field label="Rolle" hint={managed?.userId === currentUserId ? "Sie können sich nicht selbst entfernen." : undefined}>
          <Select value={manageRole} onChange={(e) => setManageRole(e.target.value)} options={ROLE_OPTIONS} />
        </Field>
      </Dialog>

      {toast ? (
        <div className="fixed bottom-6 right-6 z-[70]">
          <Toast {...toast} onClose={() => setToast(null)} />
        </div>
      ) : null}
    </>
  );
}
