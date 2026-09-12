"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Toast, type ToastProps } from "@/components/ui/toast";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { PdfPanel } from "@/components/documents/pdf-panel";
import { SendDialog } from "@/components/documents/send-dialog";
import { CreateInvoiceDialog } from "@/components/documents/create-invoice-dialog";
import { cancelDocument } from "@/app/(app)/offers/document-actions";
import { dunInvoiceAction, setDunningPauseAction } from "@/app/(app)/invoices/dunning-actions";
import { formatMoney, formatDate } from "@/lib/format";

export interface DunningInfo {
  level: number;
  maxLevel: number;
  currentLabel: string | null;
  nextLabel: string | null;
  nextDueAt: string | null;
  pausedUntil: string | null;
  active: boolean;
  due: boolean;
}

export interface DetailLine {
  id: string;
  position: number;
  type: string;
  name: string;
  itemNumber: string;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  discountLabel: string;
  account: string;
  vatRate: number;
  netCents: number;
  totalCents: number;
}

export interface DocumentDetailProps {
  id: string;
  kind: "offer" | "invoice";
  status: string;
  number: string;
  customer: string;
  contact: string;
  date: string;
  expirationDate: string;
  dueDate: string;
  eInvoice: string;
  currency: string;
  netCents: number;
  taxCents: number;
  totalCents: number;
  lines: DetailLine[];
  payment?: { status: string; paidCents: number; entries: { date: string; amountCents: number }[] };
  pdf: { state: "none" | "loading" | "ready" | "error"; filename?: string };
  invoicing: boolean;
  emailTemplates: { id: string; name: string }[];
  recipient: string;
  history: { at: string; text: string }[];
  dunning?: DunningInfo | null;
}

const KIND_PLURAL = { offer: "Angebote", invoice: "Rechnungen" } as const;

export function DocumentDetail(props: DocumentDetailProps) {
  const router = useRouter();
  const [toast, setToast] = useState<ToastProps | null>(null);
  const [sending, setSending] = useState(false);
  const cancelled = props.status === "CANCELLED";
  const canDocActions = props.invoicing && props.status === "FINALIZED";

  const lineColumns: DataTableColumn<DetailLine>[] = [
    {
      key: "name",
      label: "Position",
      render: (l) =>
        l.type === "TOTAL_DISCOUNT" ? (
          <span className="font-medium text-content">Gesamtrabatt</span>
        ) : (
          <span className="min-w-0">
            <span className="block font-medium text-content">{l.name}</span>
            {l.itemNumber ? <span className="block font-mono text-2xs text-content-subtle">{l.itemNumber}</span> : null}
          </span>
        ),
    },
    { key: "quantity", label: "Menge", align: "right", mono: true, render: (l) => (l.type === "ITEM" ? `${l.quantity} ${l.unit}`.trim() : "—") },
    { key: "unitPriceCents", label: "Einzelpreis", align: "right", mono: true, render: (l) => (l.type === "ITEM" ? formatMoney(l.unitPriceCents, props.currency) : "—") },
    { key: "discountLabel", label: "Rabatt", align: "right", mono: true, muted: true, render: (l) => l.discountLabel || "—" },
    { key: "vatRate", label: "USt", align: "right", mono: true, muted: true, render: (l) => `${l.vatRate} %` },
    { key: "netCents", label: "Netto", align: "right", mono: true, render: (l) => formatMoney(l.netCents, props.currency) },
    { key: "totalCents", label: "Gesamt", align: "right", mono: true, render: (l) => formatMoney(l.totalCents, props.currency) },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={[KIND_PLURAL[props.kind], props.number || "Entwurf"]}
        actions={
          canDocActions ? (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" iconLeft="send" onClick={() => setSending(true)}>
                Per E-Mail senden
              </Button>
              <a
                href={`/api/documents/${props.id}/pdf`}
                className="inline-flex h-[var(--control-height-sm)] items-center gap-1.5 rounded-md border border-edge bg-surface-card px-[10px] font-sans text-xs font-medium text-content shadow-xs transition hover:bg-surface-hover"
              >
                <Icon name="file-down" size={14} /> PDF herunterladen
              </a>
            </div>
          ) : undefined
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)_420px] items-start gap-4 max-lg:grid-cols-1">
        <div className="flex flex-col gap-4">
          <Card
            title="Belegdaten"
            actions={
              props.status === "FINALIZED" ? (
                <Badge tone="neutral" dot>
                  <Icon name="lock" size={11} /> Gesperrt
                </Badge>
              ) : cancelled ? (
                <Badge tone="danger">Storniert</Badge>
              ) : null
            }
          >
            {props.status === "FINALIZED" ? (
              <p className="mb-3 font-sans text-2xs text-content-subtle">Nicht mehr änderbar · Stornierung ist der einzige Rückweg</p>
            ) : null}
            <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 max-md:grid-cols-1">
              <Line label="Nummer" value={props.number || "—"} mono />
              <Line label="Kunde" value={props.customer} />
              {props.contact ? <Line label="Ansprechpartner" value={props.contact} /> : null}
              <Line label="Datum" value={props.date ? formatDate(new Date(props.date)) : "—"} />
              {props.kind === "offer" ? <Line label="Gültig bis" value={props.expirationDate ? formatDate(new Date(props.expirationDate)) : "—"} /> : null}
              {props.kind === "invoice" ? <Line label="Fälligkeit" value={props.dueDate ? formatDate(new Date(props.dueDate)) : "—"} /> : null}
              <Line label="e-Rechnung" value={props.eInvoice === "NONE" ? "Keine" : props.eInvoice} />
            </div>
          </Card>

          <Card title="Positionen" subtitle="Wie an FreeFinance übertragen" padding="none">
            <DataTable rows={props.lines} columns={lineColumns} dense />
            <div className="flex justify-end border-t border-edge-subtle px-4 py-3">
              <div className="w-[260px] font-sans text-sm">
                <Row label="Netto" value={formatMoney(props.netCents, props.currency)} />
                <Row label="USt" value={formatMoney(props.taxCents, props.currency)} />
                <Row label="Gesamt" value={formatMoney(props.totalCents, props.currency)} strong />
              </div>
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          {!props.invoicing ? (
            <div className="flex items-start gap-2 rounded-md border border-edge-warning bg-surface-warning-subtle px-3 py-2">
              <Icon name="triangle-alert" size={15} color="var(--text-warning)" />
              <div>
                <p className="font-sans text-xs font-medium text-content">Rechnungs-PDFs erfordern das FreeFinance-Plus-Paket</p>
                <p className="mt-0.5 font-sans text-2xs text-content-secondary">
                  Der Beleg wurde als Ausgangsrechnung in der Buchhaltung erfasst — ohne Nummer, Layout und PDF. Versand und Download stehen nicht zur Verfügung.
                </p>
              </div>
            </div>
          ) : (
            <PdfPanel state={props.status === "FINALIZED" ? props.pdf.state : "none"} href={`/api/documents/${props.id}/pdf`} />
          )}

          {props.payment ? (
            <Card title="Zahlstatus">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-sans text-xs text-content-secondary">Status</span>
                <Badge tone={props.payment.status === "PAID" ? "success" : props.payment.status === "PARTIAL" ? "warning" : "neutral"}>
                  {props.payment.status === "PAID" ? "Bezahlt" : props.payment.status === "PARTIAL" ? "Teilweise" : "Offen"}
                </Badge>
              </div>
              <Row label="Rechnungsbetrag" value={formatMoney(props.totalCents, props.currency)} />
              {props.payment.entries.map((e, i) => (
                <Row key={i} label={`Zahlung ${formatDate(new Date(e.date))}`} value={formatMoney(e.amountCents, props.currency)} />
              ))}
              <Row label="Offen" value={formatMoney(props.totalCents - props.payment.paidCents, props.currency)} strong />
              <p className="mt-2 font-sans text-2xs text-content-subtle">Zahlungen werden aus FreeFinance gelesen; in Kundeo wird nichts verbucht.</p>
            </Card>
          ) : null}

          {props.kind === "invoice" && canDocActions && props.dunning && props.payment?.status !== "PAID" ? (
            <DunningCard
              id={props.id}
              info={props.dunning}
              onResult={(t) => {
                setToast(t);
                router.refresh();
              }}
            />
          ) : null}

          {props.kind === "offer" && canDocActions ? (
            <Card title="Aktionen">
              <CreateInvoiceDialog offerId={props.id} onDone={() => router.refresh()} />
            </Card>
          ) : null}

          {props.history.length ? (
            <Card title="Verlauf">
              <div className="flex flex-col gap-2">
                {props.history.map((h, i) => (
                  <div key={i} className="flex items-baseline gap-2">
                    <span className="font-mono text-2xs text-content-subtle">{formatDate(new Date(h.at))}</span>
                    <span className="font-sans text-xs text-content-secondary">{h.text}</span>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {props.status === "FINALIZED" ? (
            <Button
              variant="ghost"
              size="sm"
              iconLeft="circle-x"
              onClick={() =>
                cancelDocument(props.id).then((r) =>
                  setToast(r.ok ? { tone: "success", title: "Beleg storniert" } : { tone: "danger", title: "Aktion fehlgeschlagen", description: r.error }),
                )
              }
            >
              Stornieren
            </Button>
          ) : null}
        </div>
      </div>

      {sending ? (
        <SendDialog
          documentId={props.id}
          kind={props.kind}
          templates={props.emailTemplates}
          recipient={props.recipient}
          onClose={() => setSending(false)}
          onSent={(email) => {
            setSending(false);
            setToast({ tone: "success", title: "Beleg gesendet", description: `An ${email}` });
          }}
        />
      ) : null}

      {toast ? (
        <div className="fixed bottom-6 right-6 z-[70]">
          <Toast {...toast} onClose={() => setToast(null)} />
        </div>
      ) : null}
    </>
  );
}

function DunningCard({ id, info, onResult }: { id: string; info: DunningInfo; onResult: (t: ToastProps) => void }) {
  const [pending, start] = useTransition();
  const paused = info.pausedUntil != null && new Date(info.pausedUntil).getTime() > Date.now();
  const capped = info.level >= info.maxLevel;

  const dun = () =>
    start(async () => {
      const r = await dunInvoiceAction(id);
      onResult(r.ok ? { tone: "success", title: "Mahnung erstellt", description: r.message } : { tone: "danger", title: "Aktion fehlgeschlagen", description: r.error });
    });

  const setPause = (untilISO: string | null) =>
    start(async () => {
      const r = await setDunningPauseAction(id, untilISO);
      onResult(r.ok ? { tone: "success", title: untilISO ? "Mahnlauf pausiert" : "Mahnlauf fortgesetzt" } : { tone: "danger", title: "Aktion fehlgeschlagen", description: r.error });
    });

  return (
    <Card
      title="Mahnwesen"
      actions={
        info.level > 0 ? (
          <Badge tone={capped ? "danger" : "warning"}>{info.currentLabel ?? `Stufe ${info.level}`}</Badge>
        ) : (
          <Badge tone="neutral">Keine Mahnung</Badge>
        )
      }
    >
      {!info.active ? (
        <p className="mb-2 font-sans text-2xs text-content-subtle">Das Mahnwesen ist deaktiviert — es werden keine automatischen Mahnungen versendet.</p>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Row label="Erreichte Stufe" value={info.level > 0 ? `${info.level} / ${info.maxLevel}` : `0 / ${info.maxLevel}`} />
        {capped ? (
          <p className="font-sans text-2xs text-content-subtle">Maximale Mahnstufe erreicht — bitte manuell weiterverfolgen.</p>
        ) : paused ? (
          <Row label="Pausiert bis" value={formatDate(new Date(info.pausedUntil!))} />
        ) : info.nextDueAt ? (
          <Row label={`Nächste Stufe${info.nextLabel ? ` (${info.nextLabel})` : ""}`} value={info.due ? "fällig" : formatDate(new Date(info.nextDueAt))} />
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {!capped ? (
          <Button size="sm" variant="secondary" iconLeft="send" loading={pending} onClick={dun}>
            Jetzt mahnen
          </Button>
        ) : null}
        {paused ? (
          <Button size="sm" variant="ghost" iconLeft="play" loading={pending} onClick={() => setPause(null)}>
            Fortsetzen
          </Button>
        ) : !capped ? (
          <Button
            size="sm"
            variant="ghost"
            iconLeft="pause"
            loading={pending}
            onClick={() => setPause(new Date(Date.now() + 30 * 86_400_000).toISOString())}
          >
            30 Tage pausieren
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

function Line({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-sans text-2xs uppercase tracking-wide text-content-subtle">{label}</span>
      <span className={"font-sans text-sm text-content " + (mono ? "font-mono" : "")}>{value}</span>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={"flex items-center justify-between py-0.5 " + (strong ? "border-t border-edge-subtle mt-1 pt-1.5" : "")}>
      <span className={"font-sans " + (strong ? "text-sm font-semibold text-content" : "text-xs text-content-secondary")}>{label}</span>
      <span className={"font-mono tabular-nums " + (strong ? "text-sm font-semibold text-content" : "text-xs text-content")}>{value}</span>
    </div>
  );
}
