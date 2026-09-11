import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";

const SIZES = {
  sm: { box: "h-[var(--control-height-sm)] px-[10px] gap-1.5 text-xs", icon: 14 },
  md: { box: "h-[var(--control-height-md)] px-[14px] gap-2 text-sm", icon: 16 },
  lg: { box: "h-[var(--control-height-lg)] px-[18px] gap-2 text-md", icon: 18 },
} as const;

const VARIANTS = {
  primary:
    "bg-brand text-on-brand border border-transparent shadow-xs hover:bg-brand-hover",
  secondary:
    "bg-surface-card text-content border border-edge shadow-xs hover:bg-surface-hover hover:border-edge-strong",
  ghost:
    "bg-transparent text-content-secondary border border-transparent hover:bg-surface-active",
  danger:
    "bg-red-500 text-content-inverse border border-transparent hover:bg-red-600",
  success:
    "bg-green-500 text-content-inverse border border-transparent hover:bg-green-600",
} as const;

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  children?: ReactNode;
  /** primary = indigo fill (one per view) · secondary = bordered white · ghost = toolbar/row · danger/success = destructive + won-deal actions. */
  variant?: keyof typeof VARIANTS;
  /** sm 30px (rows, filters) · md 36px (default) · lg 44px (forms, auth). */
  size?: keyof typeof SIZES;
  /** Lucide icon name before the label. */
  iconLeft?: string;
  /** Lucide icon name after the label, e.g. "chevron-down". */
  iconRight?: string;
  /** Swaps the leading icon for a spinner glyph and blocks clicks. */
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  iconLeft,
  iconRight,
  disabled = false,
  loading = false,
  fullWidth = false,
  type = "button",
  className,
  ...rest
}: ButtonProps) {
  const s = SIZES[size] ?? SIZES.md;
  const off = disabled || loading;
  return (
    <button
      type={type}
      disabled={off}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-md font-sans font-medium leading-none tracking-snug transition duration-[120ms] ease-out",
        "focus-visible:outline-none focus-visible:[box-shadow:var(--ring-brand)]",
        "active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50",
        s.box,
        VARIANTS[variant] ?? VARIANTS.primary,
        fullWidth && "flex w-full",
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Icon name="loader-circle" size={s.icon} />
      ) : iconLeft ? (
        <Icon name={iconLeft} size={s.icon} />
      ) : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={s.icon} /> : null}
    </button>
  );
}
