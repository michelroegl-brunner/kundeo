"use client";

import { useState, useTransition } from "react";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/empty-state";
import { Toast, type ToastProps } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import {
  createMcpKey,
  revokeMcpKey,
  revokeMcpConnection,
  type McpKeyItem,
  type McpConnectionItem,
  type McpScope,
} from "@/app/(app)/settings/mcp-actions";

const SCOPE_OPTIONS = [
  { value: "read_write", label: "Lesen & Schreiben" },
  { value: "read_only", label: "Nur Lesen" },
];

function scopeLabel(scope: McpScope): string {
  return scope === "read_only" ? "Nur Lesen" : "Lesen & Schreiben";
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function McpKeysView({
  keys,
  connections,
  canManage,
  endpoint,
}: {
  keys: McpKeyItem[];
  connections: McpConnectionItem[];
  canManage: boolean;
  endpoint: string;
}) {
  const [name, setName] = useState("");
  const [scope, setScope] = useState<McpScope>("read_write");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastProps | null>(null);
  const [pending, start] = useTransition();

  function create() {
    if (!name.trim()) {
      setToast({ tone: "warning", title: "Bitte einen Namen angeben." });
      return;
    }
    start(async () => {
      const res = await createMcpKey(name.trim(), scope);
      if (res.ok) {
        setNewToken(res.token);
        setName("");
        setToast({ tone: "success", title: "Schlüssel erstellt" });
      } else {
        setToast({ tone: "danger", title: "Erstellen fehlgeschlagen", description: res.error });
      }
    });
  }

  function revoke(id: string) {
    start(async () => {
      const res = await revokeMcpKey(id);
      setToast(
        res.ok
          ? { tone: "success", title: "Schlüssel widerrufen" }
          : { tone: "danger", title: "Widerrufen fehlgeschlagen", description: res.error },
      );
    });
  }

  function revokeConnection(clientId: string) {
    start(async () => {
      const res = await revokeMcpConnection(clientId);
      setToast(
        res.ok
          ? { tone: "success", title: "Verbindung widerrufen" }
          : { tone: "danger", title: "Widerrufen fehlgeschlagen", description: res.error },
      );
    });
  }

  return (
    <>
      <PageHeader title="MCP-Zugriff" breadcrumb={["Einstellungen", "MCP-Zugriff"]} />

      <div className="flex flex-col gap-4">
        <Card
          title="Model Context Protocol"
          subtitle="Verbinde KI-Agenten (z. B. Claude Cowork) mit den CRM-Daten dieser Organisation."
        >
          <div className="flex flex-col gap-3 text-sm text-content-secondary">
            <p>
              Agenten verbinden sich mit dem MCP-Endpunkt entweder per{" "}
              <span className="font-medium text-content">OAuth</span> (der Client leitet dich zur
              Freigabe hierher – empfohlen) oder mit einem manuell erstellten{" "}
              <span className="font-medium text-content">Bearer-Schlüssel</span>. Beide Wege sind auf
              diese Organisation beschränkt; alle Zugriffe unterliegen der Mandanten-Isolation
              (Row-Level Security).
            </p>
            <Field label="Endpunkt" hint="Streamable-HTTP-Transport. Authentifizierung per Bearer-Token.">
              <div className="flex items-center gap-2">
                <Input value={endpoint} readOnly mono onFocus={(e) => e.currentTarget.select()} />
                <Button
                  variant="secondary"
                  iconLeft="copy"
                  onClick={async () =>
                    setToast(
                      (await copy(endpoint))
                        ? { tone: "success", title: "Endpunkt kopiert" }
                        : { tone: "danger", title: "Kopieren fehlgeschlagen" },
                    )
                  }
                >
                  Kopieren
                </Button>
              </div>
            </Field>
          </div>
        </Card>

        {newToken ? (
          <Card
            title="Neuer Schlüssel"
            subtitle="Kopiere ihn jetzt — er wird aus Sicherheitsgründen nur dieses eine Mal angezeigt."
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 rounded-md border border-edge bg-surface-sunken px-3 py-2">
                <Icon name="key-round" size={16} className="text-content-muted" />
                <code className="min-w-0 flex-1 truncate font-mono text-sm text-content">{newToken}</code>
                <Button
                  size="sm"
                  variant="secondary"
                  iconLeft="copy"
                  onClick={async () =>
                    setToast(
                      (await copy(newToken))
                        ? { tone: "success", title: "Schlüssel kopiert" }
                        : { tone: "danger", title: "Kopieren fehlgeschlagen" },
                    )
                  }
                >
                  Kopieren
                </Button>
              </div>
              <div className="flex items-start gap-2 text-xs text-content-muted">
                <Icon name="triangle-alert" size={14} className="mt-px text-warning" />
                <p>
                  Übergib den Schlüssel im Header <code className="font-mono">Authorization: Bearer …</code>.
                  Bewahre ihn sicher auf; bei Verlust widerrufe ihn und erstelle einen neuen.
                </p>
              </div>
              <div>
                <Button variant="ghost" size="sm" onClick={() => setNewToken(null)}>
                  Verstanden, ausblenden
                </Button>
              </div>
            </div>
          </Card>
        ) : null}

        {connections.length > 0 ? (
          <Card
            title="Verbundene Agenten (OAuth)"
            subtitle="Über den Discovery-Flow verbundene Clients. Widerruf beendet den Zugriff sofort."
            padding="none"
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge-subtle text-left text-xs text-content-muted">
                  <th className="px-4 py-2 font-medium">Client</th>
                  <th className="px-4 py-2 font-medium">Berechtigung</th>
                  <th className="px-4 py-2 font-medium">Verbunden</th>
                  <th className="px-4 py-2 font-medium">Zuletzt genutzt</th>
                  {canManage ? <th className="px-4 py-2" /> : null}
                </tr>
              </thead>
              <tbody>
                {connections.map((c) => (
                  <tr key={c.clientId} className="border-b border-edge-subtle last:border-0">
                    <td className="px-4 py-2.5 text-content">{c.clientName}</td>
                    <td className="px-4 py-2.5 text-content-secondary">{scopeLabel(c.scope)}</td>
                    <td className="px-4 py-2.5 text-content-secondary">{formatDate(c.connectedAt)}</td>
                    <td className="px-4 py-2.5 text-content-secondary">
                      {c.lastUsedAt ? formatDate(c.lastUsedAt) : "—"}
                    </td>
                    {canManage ? (
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          iconLeft="unplug"
                          disabled={pending}
                          onClick={() => revokeConnection(c.clientId)}
                        >
                          Widerrufen
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : null}

        {canManage ? (
          <Card title="Schlüssel erstellen">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field label="Name" hint="Zur Wiedererkennung, z. B. „Claude Cowork“." className="flex-1">
                <Input
                  value={name}
                  placeholder="Mein Agent"
                  maxLength={80}
                  onChange={(e) => setName(e.currentTarget.value)}
                />
              </Field>
              <Field label="Berechtigung" className="sm:w-56">
                <Select
                  options={SCOPE_OPTIONS}
                  value={scope}
                  onChange={(e) => setScope(e.currentTarget.value as McpScope)}
                />
              </Field>
              <Button iconLeft="plus" loading={pending} onClick={create}>
                Erstellen
              </Button>
            </div>
          </Card>
        ) : null}

        <Card title="Aktive Schlüssel" padding="none">
          {keys.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon="key-round"
                title="Noch keine Schlüssel"
                description={
                  canManage
                    ? "Erstelle einen Schlüssel, um einen Agenten zu verbinden."
                    : "Ein Administrator kann hier Schlüssel für den Agentenzugriff erstellen."
                }
              />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge-subtle text-left text-xs text-content-muted">
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Schlüssel</th>
                  <th className="px-4 py-2 font-medium">Berechtigung</th>
                  <th className="px-4 py-2 font-medium">Erstellt</th>
                  <th className="px-4 py-2 font-medium">Zuletzt genutzt</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  {canManage ? <th className="px-4 py-2" /> : null}
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => {
                  const revoked = k.revokedAt !== null;
                  return (
                    <tr key={k.id} className="border-b border-edge-subtle last:border-0">
                      <td className="px-4 py-2.5 text-content">{k.name}</td>
                      <td className="px-4 py-2.5">
                        <code className="font-mono text-xs text-content-muted">{k.keyPrefix}…</code>
                      </td>
                      <td className="px-4 py-2.5 text-content-secondary">{scopeLabel(k.scope)}</td>
                      <td className="px-4 py-2.5 text-content-secondary">{formatDate(k.createdAt)}</td>
                      <td className="px-4 py-2.5 text-content-secondary">
                        {k.lastUsedAt ? formatDate(k.lastUsedAt) : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone={revoked ? "neutral" : "success"}>
                          {revoked ? "Widerrufen" : "Aktiv"}
                        </Badge>
                      </td>
                      {canManage ? (
                        <td className="px-4 py-2.5 text-right">
                          {revoked ? null : (
                            <Button
                              variant="ghost"
                              size="sm"
                              iconLeft="trash-2"
                              disabled={pending}
                              onClick={() => revoke(k.id)}
                            >
                              Widerrufen
                            </Button>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {toast ? (
        <div className="fixed bottom-6 right-6 z-[70]">
          <Toast {...toast} onClose={() => setToast(null)} />
        </div>
      ) : null}
    </>
  );
}
