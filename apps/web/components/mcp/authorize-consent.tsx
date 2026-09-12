"use client";

import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { decideAuthorization } from "@/app/api/mcp/oauth/authorize/actions";
import type { McpScope } from "@/lib/mcp/oauth";

interface ConsentParams {
  response_type: string;
  client_id: string;
  redirect_uri: string;
  scope: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
}

const SCOPE_TEXT: Record<McpScope, string> = {
  read_write: "Kontakte, Firmen, Deals und Aktivitäten lesen und bearbeiten",
  read_only: "Kontakte, Firmen, Deals und Aktivitäten nur lesen",
};

export function AuthorizeConsent({
  clientName,
  orgName,
  userEmail,
  scope,
  params,
}: {
  clientName: string;
  orgName: string;
  userEmail: string;
  scope: McpScope;
  params: ConsentParams;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-sunken p-4">
      <div className="w-[420px] max-w-full">
        <Card>
          <form action={decideAuthorization} className="flex flex-col gap-5">
            <div className="flex flex-col items-center gap-3 text-center">
              <Image src="/kundeo-icon.svg" alt="Kundeo" width={40} height={40} priority />
              <h1 className="text-lg font-semibold tracking-tight text-content">Zugriff erlauben?</h1>
              <p className="text-sm text-content-secondary">
                <span className="font-medium text-content">{clientName}</span> möchte über das Model
                Context Protocol auf die Daten deiner Organisation zugreifen.
              </p>
            </div>

            <div className="flex flex-col gap-2 rounded-md border border-edge bg-surface-card p-3 text-sm">
              <Row icon="building-2" label="Organisation" value={orgName} />
              <Row icon="user" label="Angemeldet als" value={userEmail} />
              <Row icon="shield-check" label="Berechtigung" value={SCOPE_TEXT[scope]} />
            </div>

            <p className="flex items-start gap-2 text-xs text-content-muted">
              <Icon name="info" size={14} className="mt-px" />
              Der Zugriff ist auf diese Organisation beschränkt. Du kannst die Verbindung jederzeit in
              den Einstellungen widerrufen.
            </p>

            {/* All original request params are echoed back and re-validated server-side. */}
            <input type="hidden" name="response_type" value={params.response_type} />
            <input type="hidden" name="client_id" value={params.client_id} />
            <input type="hidden" name="redirect_uri" value={params.redirect_uri} />
            <input type="hidden" name="scope" value={params.scope} />
            <input type="hidden" name="state" value={params.state} />
            <input type="hidden" name="code_challenge" value={params.code_challenge} />
            <input type="hidden" name="code_challenge_method" value={params.code_challenge_method} />

            <div className="flex gap-2">
              <Button type="submit" name="decision" value="deny" variant="secondary" fullWidth>
                Ablehnen
              </Button>
              <Button type="submit" name="decision" value="approve" variant="primary" fullWidth>
                Erlauben
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}

function Row({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon name={icon} size={16} className="text-content-muted" />
      <span className="text-content-muted">{label}:</span>
      <span className="min-w-0 flex-1 truncate text-right font-medium text-content">{value}</span>
    </div>
  );
}
