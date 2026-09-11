import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";

export interface EmptyStateProps {
  /** Lucide icon in a rounded grey tile. */
  icon?: string;
  /** What is missing, as a statement: "Noch keine Deals". */
  title?: ReactNode;
  /** One sentence on what to do next. */
  description?: ReactNode;
  /** Usually a primary Button. */
  action?: ReactNode;
  /** Tighter padding for inside a card or column. */
  compact?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function EmptyState({ icon = "inbox", title, description, action, compact = false, className, style }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-center",
        compact ? "p-6" : "px-6 py-12",
        className,
      )}
      style={style}
    >
      <span
        className={cn(
          "grid place-items-center rounded-lg bg-surface-sunken text-content-subtle",
          compact ? "h-9 w-9" : "h-12 w-12",
        )}
      >
        <Icon name={icon} size={compact ? 18 : 22} />
      </span>
      <div>
        <p className="font-sans text-sm font-semibold text-content">{title}</p>
        {description ? (
          <p className="mx-auto mt-1 max-w-[320px] font-sans text-xs leading-normal text-content-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
