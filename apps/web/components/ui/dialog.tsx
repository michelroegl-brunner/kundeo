"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { IconButton } from "./icon-button";

export interface DialogProps {
  open?: boolean;
  /** German title, sentence case ("Deal anlegen"). */
  title?: ReactNode;
  /** One-sentence explanation under the title. */
  description?: ReactNode;
  children?: ReactNode;
  /** Right-aligned action row — secondary "Abbrechen" then the primary action. */
  footer?: ReactNode;
  /** Max width in px. 440 confirm · 520 default · 680 form-heavy. */
  width?: number;
  onClose?: () => void;
}

export function Dialog({ open = true, title, description, children, footer, width = 520, onClose }: DialogProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center p-6 [backdrop-filter:blur(2px)]"
      style={{ background: "var(--surface-overlay)" }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full overflow-hidden rounded-xl border border-edge bg-surface-card shadow-xl"
        style={{ maxWidth: width }}
      >
        <header className="flex items-start gap-4 px-5 pb-4 pt-5">
          <div className="min-w-0 flex-1">
            <h2 className={cn("font-sans text-lg font-semibold tracking-snug text-content")}>{title}</h2>
            {description ? (
              <p className="mt-1.5 font-sans text-sm leading-normal text-content-secondary">{description}</p>
            ) : null}
          </div>
          {onClose ? <IconButton icon="x" label="Schließen" onClick={onClose} /> : null}
        </header>
        {children ? <div className="px-5 pb-5">{children}</div> : null}
        {footer ? (
          <footer className="flex justify-end gap-2 border-t border-edge-subtle bg-surface-page px-5 py-4">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
