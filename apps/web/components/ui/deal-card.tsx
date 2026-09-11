import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";
import { Avatar } from "./avatar";
import { formatMoney } from "@/lib/format";

export interface DealCardProps {
  /** Deal.title, 2 lines max. */
  title?: string;
  /** Company.name, shown with a building glyph. */
  company?: string;
  /** Deal.amountCents — minor units, formatted without decimals on the board. */
  amountCents?: number;
  currency?: "EUR" | "CHF";
  /** Owner full name → initials avatar. */
  owner?: string;
  /** Expected close, e.g. "14.03.2026". */
  dueLabel?: string;
  /** Renders the due label in danger colour. */
  overdue?: boolean;
  /** Drag affordance: rotate -1deg + --shadow-drag. */
  dragging?: boolean;
  /** Optional action row rendered at the bottom of the card (e.g. won/lost). */
  footer?: ReactNode;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
}

export function DealCard({
  title,
  company,
  amountCents,
  currency = "EUR",
  owner,
  dueLabel,
  overdue = false,
  dragging = false,
  footer,
  onClick,
  className,
  style,
}: DealCardProps) {
  return (
    <article
      onClick={onClick}
      className={cn(
        "flex flex-col gap-2 rounded-md border bg-surface-card p-3 transition duration-[120ms] ease-out",
        "border-edge hover:border-edge-strong",
        dragging ? "-rotate-1 shadow-drag" : "shadow-xs",
        onClick ? "cursor-pointer" : "cursor-grab",
        className,
      )}
      style={style}
    >
      <p className="font-sans text-sm font-semibold leading-snug tracking-snug text-content">{title}</p>
      {company ? (
        <span className="inline-flex items-center gap-[5px] font-sans text-xs text-content-muted">
          <Icon name="building-2" size={12} />
          {company}
        </span>
      ) : null}
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-medium tabular-nums text-content">
          {formatMoney(amountCents, currency, { decimals: false })}
        </span>
        {owner ? <Avatar name={owner} size="xs" /> : null}
      </div>
      {dueLabel ? (
        <span
          className={cn(
            "inline-flex items-center gap-[5px] font-sans text-2xs",
            overdue ? "text-danger" : "text-content-subtle",
          )}
        >
          <Icon name="calendar" size={11} />
          {dueLabel}
        </span>
      ) : null}
      {footer ? <div className="mt-0.5 flex items-center gap-1.5 border-t border-edge-subtle pt-2">{footer}</div> : null}
    </article>
  );
}
