"use client";

import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";

/** The right-column PDF preview: not-available (draft/CBI), loading, or ready. */
export function PdfPanel({ state, href }: { state: "none" | "loading" | "ready" | "error"; href: string }) {
  return (
    <Card title="PDF">
      <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-edge bg-surface-sunken p-6 text-center">
        {state === "ready" ? (
          <>
            <div className="mb-3 h-[180px] w-[135px] rounded-sm border border-edge bg-surface-card shadow-xs" aria-hidden />
            <a
              href={href}
              className="inline-flex h-[var(--control-height-sm)] items-center gap-1.5 rounded-md border border-edge bg-surface-card px-[10px] font-sans text-xs font-medium text-content shadow-xs transition hover:bg-surface-hover"
            >
              <Icon name="file-down" size={14} /> PDF herunterladen
            </a>
          </>
        ) : state === "loading" ? (
          <>
            <Icon name="loader-circle" size={22} className="animate-spin" color="var(--text-subtle)" />
            <p className="mt-2 font-sans text-xs text-content-subtle">PDF wird geladen …</p>
          </>
        ) : (
          <>
            <Icon name="file-text" size={22} color="var(--text-subtle)" />
            <p className="mt-2 font-sans text-xs font-medium text-content">Noch kein PDF</p>
            <p className="mt-0.5 font-sans text-2xs text-content-subtle">FreeFinance erzeugt Nummer und PDF erst beim Finalisieren.</p>
          </>
        )}
      </div>
      <p className="mt-2 font-sans text-2xs text-content-subtle">
        Vorschau-Platzhalter — das PDF wird bei Bedarf von FreeFinance geladen und nicht in Kundeo gespeichert.
      </p>
    </Card>
  );
}
