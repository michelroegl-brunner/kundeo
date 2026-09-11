import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";

const ACCENTS = {
  success: "var(--kundeo-green)",
  warning: "var(--kundeo-amber)",
  brand: "var(--kundeo-indigo)",
  neutral: "var(--neutral-400)",
} as const;

export interface StatTileProps {
  /** Uppercase 11px label, e.g. "Pipeline offen". */
  label?: ReactNode;
  /** Pre-formatted value — mono + tabular. Use formatMoney() for amounts. */
  value?: ReactNode;
  /** Unit shown after the value, e.g. "Deals". */
  unit?: ReactNode;
  /** Percent change; sign picks colour and arrow. */
  delta?: number;
  /** Comparison period, e.g. "vs. Vormonat". */
  deltaLabel?: ReactNode;
  icon?: string;
  /** Tints the icon only: brand · success · warning · neutral. */
  tone?: keyof typeof ACCENTS;
  className?: string;
  style?: CSSProperties;
}

export function StatTile({ label, value, unit, delta, deltaLabel, icon, tone = "neutral", className, style }: StatTileProps) {
  const up = typeof delta === "number" ? delta >= 0 : null;
  const accent = ACCENTS[tone] ?? ACCENTS.neutral;
  return (
    <div
      className={cn("flex min-w-0 flex-col gap-2 rounded-lg border border-edge bg-surface-card p-4 shadow-xs", className)}
      style={style}
    >
      <div className="flex items-center gap-2">
        {icon ? <Icon name={icon} size={14} color={accent} /> : null}
        <span className="font-sans text-2xs font-semibold uppercase tracking-wide text-content-muted">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-xl font-medium tabular-nums tracking-tight text-content">{value}</span>
        {unit ? <span className="font-sans text-xs text-content-muted">{unit}</span> : null}
      </div>
      {delta != null ? (
        <div className={cn("flex items-center gap-[5px] font-sans text-xs", up ? "text-success" : "text-danger")}>
          <Icon name={up ? "trending-up" : "trending-down"} size={13} />
          <span className="font-medium tabular-nums">
            {up ? "+" : ""}
            {delta} %
          </span>
          {deltaLabel ? <span className="text-content-muted">{deltaLabel}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
