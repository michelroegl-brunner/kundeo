import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";

const TONES = {
  neutral: "bg-surface-sunken text-content-secondary",
  brand: "bg-surface-brand-subtle text-content-brand",
  success: "bg-surface-success-subtle text-success",
  warning: "bg-surface-warning-subtle text-warning",
  danger: "bg-surface-danger-subtle text-danger",
} as const;

export interface BadgeProps {
  children?: ReactNode;
  /** neutral = counts/meta · brand = OFFEN · success = GEWONNEN · danger = VERLOREN · warning = ÜBERFÄLLIG. */
  tone?: keyof typeof TONES;
  /** Lucide icon name rendered at 12px before the label. */
  icon?: string;
  /** Leading 6px dot instead of an icon — used for deal status. */
  dot?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Badge({ children, tone = "neutral", icon, dot = false, className, style }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-sm px-2 font-sans text-2xs font-semibold uppercase tracking-wide",
        TONES[tone] ?? TONES.neutral,
        className,
      )}
      style={style}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {icon ? <Icon name={icon} size={12} /> : null}
      {children}
    </span>
  );
}
