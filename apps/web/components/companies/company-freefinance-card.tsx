"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Toast, type ToastProps } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import { syncCompanyToFreeFinance } from "@/app/(app)/companies/freefinance-actions";

export interface CompanyFreeFinanceCardProps {
  companyId: string;
  synced: boolean;
  customerNumber?: string | null;
  /** ISO date of the last sync. */
  syncedAt?: string | null;
  /** FreeFinance base URL for the "öffnen" link, or null when unknown. */
  openUrl?: string | null;
}

/**
 * FreeFinance block on the company detail. Rendered only when the integration is
 * connected (capability-gated at the page). Shows whether the company is a
 * FreeFinance customer and its Kundennummer, and lets the user push it now.
 */
export function CompanyFreeFinanceCard({ companyId, synced, customerNumber, syncedAt, openUrl }: CompanyFreeFinanceCardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<ToastProps | null>(null);

  function sync() {
    startTransition(async () => {
      const res = await syncCompanyToFreeFinance(companyId);
      if (res.ok) {
        setToast({ tone: "success", title: "Kunde synchronisiert", description: res.number ? `Kundennummer ${res.number}` : undefined });
        router.refresh();
      } else {
        setToast({ tone: "danger", title: "Aktion fehlgeschlagen", description: res.error });
      }
    });
  }

  return (
    <>
      <Card
        title="FreeFinance"
        actions={synced ? <Badge tone="success" dot>Synchronisiert</Badge> : <Badge tone="neutral">Nicht synchronisiert</Badge>}
      >
        {synced ? (
          <div className="mb-3 flex flex-col gap-[7px]">
            <div className="grid grid-cols-[112px_1fr] gap-3">
              <span className="font-sans text-xs text-content-muted">Kundennummer</span>
              <span className="font-mono text-xs tabular-nums text-content">{customerNumber || "—"}</span>
            </div>
            <div className="grid grid-cols-[112px_1fr] gap-3">
              <span className="font-sans text-xs text-content-muted">Zuletzt</span>
              <span className="font-sans text-xs text-content">{syncedAt ? formatDate(new Date(syncedAt)) : "—"}</span>
            </div>
          </div>
        ) : (
          <p className="mb-3 font-sans text-xs text-content-secondary">
            Diese Firma ist noch nicht als Kunde in FreeFinance angelegt.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={synced ? "secondary" : "primary"} iconLeft="refresh-cw" loading={pending} onClick={sync}>
            An FreeFinance senden
          </Button>
          {synced && openUrl ? (
            <a
              href={openUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-[var(--control-height-sm)] items-center gap-1.5 rounded-md border border-edge bg-surface-card px-[10px] font-sans text-xs font-medium text-content shadow-xs transition hover:bg-surface-hover"
            >
              <Icon name="external-link" size={14} /> In FreeFinance öffnen
            </a>
          ) : null}
        </div>
      </Card>

      {toast ? (
        <div className="fixed bottom-6 right-6 z-[70]">
          <Toast {...toast} onClose={() => setToast(null)} />
        </div>
      ) : null}
    </>
  );
}
