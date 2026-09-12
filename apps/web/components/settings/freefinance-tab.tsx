"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import type { RunFn } from "@/components/settings/settings-view";
import type { FreeFinanceConfigPublic } from "@/lib/freefinance/config";
import {
  saveFreeFinanceConnection,
  disconnectFreeFinance,
  testFreeFinanceConnection,
  saveFreeFinanceDefaults,
  type CapabilityResult,
  type FreeFinanceRefData,
  type FreeFinanceDefaults,
} from "@/app/(app)/settings/freefinance-actions";

interface FfError {
  message: string;
  code: string;
  identifier: string;
}

export interface FreeFinanceTabProps {
  config: FreeFinanceConfigPublic;
  defaults: FreeFinanceDefaults;
  pending: boolean;
  run: RunFn;
}

const EINVOICE_OPTIONS = [
  { value: "NONE", label: "Keine" },
  { value: "EB_V6_P1", label: "ebInterface 6.0" },
  { value: "X_RECHNUNG_V3_P0_UBL", label: "XRechnung 3.0" },
];

export function FreeFinanceTab({ config, defaults, pending, run }: FreeFinanceTabProps) {
  const router = useRouter();
  const envSourced = config.source === "env";
  const [form, setForm] = useState({
    baseUrl: config.baseUrl,
    clientId: config.clientId,
    mandant: config.mandant,
    clientSecret: "",
  });
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const [testing, startTest] = useTransition();
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [caps, setCaps] = useState<CapabilityResult | null>(null);
  const [refdata, setRefdata] = useState<FreeFinanceRefData | null>(null);
  const [error, setError] = useState<FfError | null>(null);

  const [defForm, setDefForm] = useState<FreeFinanceDefaults>(defaults);
  const defDirty = JSON.stringify(defForm) !== JSON.stringify(defaults);

  const connected = config.source !== null && config.hasSecret;

  function test() {
    setError(null);
    startTest(async () => {
      const res = await testFreeFinanceConnection();
      if (res.ok) {
        setCaps(res.capabilities ?? null);
        setRefdata(res.refdata ?? null);
        setCheckedAt(new Date().toLocaleString("de-DE"));
      } else {
        setCaps(null);
        setError((res.ffError as FfError) ?? { message: res.error ?? "Fehler", code: "", identifier: "" });
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card
        title="FreeFinance"
        subtitle="Buchhaltung · Kunden, Artikel, Angebote und Rechnungen"
        actions={
          <div className="flex items-center gap-2">
            {connected ? (
              <Badge tone="success" dot>
                Verbunden
              </Badge>
            ) : (
              <Badge tone="neutral" dot>
                Nicht verbunden
              </Badge>
            )}
            {caps && !caps.modules.inv ? <Badge tone="warning">Eingeschränkt</Badge> : null}
          </div>
        }
        footer={
          <div className="flex items-center justify-between gap-2">
            <div>
              {connected && !envSourced ? (
                <Button
                  variant="ghost"
                  size="sm"
                  iconLeft="plug"
                  loading={pending}
                  onClick={() =>
                    run(() => disconnectFreeFinance(), { tone: "success", title: "Verbindung getrennt" }, () => {
                      setCaps(null);
                      setRefdata(null);
                    })
                  }
                >
                  Verbindung trennen
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" iconLeft="plug-zap" loading={testing} onClick={test}>
                Verbindung testen
              </Button>
              {!envSourced ? (
                <Button
                  size="sm"
                  loading={pending}
                  disabled={!form.baseUrl.trim() || !form.clientId.trim() || !form.mandant.trim()}
                  onClick={() =>
                    run(() => saveFreeFinanceConnection(form), { tone: "success", title: "Verbindung gespeichert" }, () => {
                      setForm((f) => ({ ...f, clientSecret: "" }));
                      router.refresh();
                    })
                  }
                >
                  Verbinden
                </Button>
              ) : null}
            </div>
          </div>
        }
      >
        {envSourced ? (
          <p className="mb-3 flex items-center gap-1.5 font-sans text-xs text-content-secondary">
            <Icon name="lock" size={13} />
            Zugangsdaten aus der Umgebung haben Vorrang vor diesen Feldern.
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field label="Base-URL" hint="Ohne Pfad; /api/2.0 wird ergänzt">
            <Input
              mono
              value={form.baseUrl}
              readOnly={envSourced}
              placeholder="https://meine-instanz.freefinance.at"
              onChange={(e) => set("baseUrl")(e.target.value)}
            />
          </Field>
          <Field label="Mandant" hint="Numerische Client-ID aus GET /clients">
            <Input mono value={form.mandant} readOnly={envSourced} onChange={(e) => set("mandant")(e.target.value)} />
          </Field>
          <Field label="Client-ID" hint="Technischer Benutzer, Format mandant_userId">
            <Input mono value={form.clientId} readOnly={envSourced} onChange={(e) => set("clientId")(e.target.value)} />
          </Field>
          <Field label="Client-Secret" hint="Verschlüsselt gespeichert, wird nie erneut angezeigt">
            <Input
              type="password"
              value={form.clientSecret}
              readOnly={envSourced}
              placeholder={config.hasSecret ? "•••••••• (unverändert lassen)" : ""}
              onChange={(e) => set("clientSecret")(e.target.value)}
            />
          </Field>
        </div>

        {checkedAt && !error ? (
          <div className="mt-4 flex items-center gap-1.5 rounded-md border border-edge-success bg-surface-success-subtle px-3 py-2">
            <Icon name="circle-check" size={15} color="var(--text-success)" />
            <span className="font-sans text-xs text-content">Verbindung erfolgreich · zuletzt geprüft {checkedAt}</span>
          </div>
        ) : null}

        {error ? <ErrorPanel error={error} /> : null}

        {caps ? (
          <div className="mt-4 grid grid-cols-3 gap-3 max-md:grid-cols-1">
            <Info label="Mandant" value={caps.mandantLabel ?? "—"} />
            <Info label="Paket" value={caps.productType ?? "—"} />
            <div>
              <p className="mb-1 font-sans text-2xs font-medium uppercase tracking-wide text-content-subtle">Module</p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(caps.modules).map(([k, v]) => (
                  <Badge key={k} tone={v ? "success" : "neutral"}>
                    {k.toUpperCase()}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {caps && !caps.modules.inv ? (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-edge-warning bg-surface-warning-subtle px-3 py-2">
            <Icon name="triangle-alert" size={15} color="var(--text-warning)" />
            <span className="font-sans text-xs text-content-secondary">
              Rechnungs-PDFs erfordern das FreeFinance-Plus-Paket. Ohne das Modul Rechnungswesen werden Belege ohne
              Nummer, Layout und PDF erfasst.
            </span>
          </div>
        ) : null}
      </Card>

      {connected ? (
        <Card
          title="Standardwerte"
          subtitle="Vorbelegung für neue Produkte und Belege"
          footer={
            <div className="flex justify-end">
              <Button
                size="sm"
                loading={pending}
                disabled={!defDirty}
                onClick={() => run(() => saveFreeFinanceDefaults(defForm), { tone: "success", title: "Standardwerte gespeichert" })}
              >
                Speichern
              </Button>
            </div>
          }
        >
          <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
            <Field label="Standard-Erlöskonto" hint="Je Produkt und je Belegzeile überschreibbar">
              <Select
                value={defForm.account}
                onChange={(e) => setDefForm((d) => ({ ...d, account: e.target.value }))}
                options={refdata?.accounts ?? [{ value: defForm.account, label: defForm.account || "—" }]}
                disabled={!refdata}
              />
            </Field>
            <Field label="Standard-USt-Satz">
              <Select
                value={String(defForm.vatRate)}
                onChange={(e) => setDefForm((d) => ({ ...d, vatRate: Number(e.target.value) }))}
                options={refdata?.vatRates ?? [{ value: String(defForm.vatRate), label: `${defForm.vatRate} %` }]}
                disabled={!refdata}
              />
            </Field>
            <Field label="Standard-Einheit">
              <Select
                value={defForm.unit}
                onChange={(e) => setDefForm((d) => ({ ...d, unit: e.target.value }))}
                options={refdata?.units ?? [{ value: defForm.unit, label: defForm.unit || "—" }]}
                disabled={!refdata}
              />
            </Field>
            <Field label="e-Rechnung">
              <Select
                value={defForm.eInvoice}
                onChange={(e) => setDefForm((d) => ({ ...d, eInvoice: e.target.value }))}
                options={EINVOICE_OPTIONS}
              />
            </Field>
          </div>
          {!refdata ? (
            <p className="mt-3 font-sans text-2xs text-content-subtle">
              Konto-, USt- und Einheitenlisten werden nach „Verbindung testen“ aus FreeFinance geladen.
            </p>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 font-sans text-2xs font-medium uppercase tracking-wide text-content-subtle">{label}</p>
      <p className="font-sans text-sm text-content">{value}</p>
    </div>
  );
}

function ErrorPanel({ error }: { error: FfError }) {
  return (
    <div className="mt-4 rounded-md border border-edge-danger bg-surface-danger-subtle p-3">
      <div className="flex items-start gap-2">
        <Icon name="circle-x" size={15} color="var(--text-danger)" />
        <div className="min-w-0 flex-1">
          <p className="font-sans text-xs text-content">{error.message}</p>
          <div className="mt-2 flex flex-wrap gap-3">
            {error.identifier ? (
              <span className="font-sans text-2xs uppercase tracking-wide text-content-subtle">
                Kennung <span className="ml-1 rounded bg-surface-card px-1.5 py-0.5 font-mono text-content-secondary">{error.identifier}</span>
              </span>
            ) : null}
            {error.code ? (
              <span className="font-sans text-2xs uppercase tracking-wide text-content-subtle">
                Code <span className="ml-1 rounded bg-surface-card px-1.5 py-0.5 font-mono text-content-secondary">{error.code}</span>
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
