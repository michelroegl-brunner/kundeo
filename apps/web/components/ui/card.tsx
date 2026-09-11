import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

const PADS = { none: "p-0", sm: "p-3", md: "p-4", lg: "p-6" } as const;
const ELEVATION = { flat: "shadow-xs", hover: "shadow-sm", raised: "shadow-md" } as const;

export interface CardProps {
  children?: ReactNode;
  /** Short German heading, 14px semibold. */
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned header controls — usually Button variant="ghost" or IconButton. */
  actions?: ReactNode;
  footer?: ReactNode;
  /** Body padding. Use "none" when the body is a DataTable. */
  padding?: keyof typeof PADS;
  /** flat = 1px border + hairline shadow (default) · raised = floating panel. */
  elevation?: keyof typeof ELEVATION;
  className?: string;
  style?: CSSProperties;
  bodyClassName?: string;
  bodyStyle?: CSSProperties;
}

export function Card({
  children,
  title,
  subtitle,
  actions,
  footer,
  padding = "md",
  elevation = "flat",
  className,
  style,
  bodyClassName,
  bodyStyle,
}: CardProps) {
  const hasHeader = title || subtitle || actions;
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-lg border border-edge bg-surface-card",
        ELEVATION[elevation] ?? ELEVATION.flat,
        className,
      )}
      style={style}
    >
      {hasHeader ? (
        <header className="flex items-center gap-3 border-b border-edge-subtle p-4">
          <div className="min-w-0 flex-1">
            {title ? (
              <h3 className="font-sans text-sm font-semibold tracking-snug text-content">{title}</h3>
            ) : null}
            {subtitle ? (
              <p className="mt-0.5 font-sans text-xs text-content-muted">{subtitle}</p>
            ) : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn("min-w-0 flex-1", PADS[padding] ?? PADS.md, bodyClassName)} style={bodyStyle}>
        {children}
      </div>
      {footer ? (
        <footer className="border-t border-edge-subtle bg-surface-page px-4 py-3">{footer}</footer>
      ) : null}
    </section>
  );
}
