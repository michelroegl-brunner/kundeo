import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";

const SIZES = {
  sm: { box: "w-[26px] h-[26px]", glyph: 14 },
  md: { box: "w-8 h-8", glyph: 16 },
  lg: { box: "w-10 h-10", glyph: 20 },
} as const;

const VARIANTS = {
  ghost:
    "bg-transparent text-content-secondary border border-transparent hover:bg-surface-active",
  outline:
    "bg-surface-card text-content-secondary border border-edge hover:bg-surface-active",
  solid:
    "bg-brand text-on-brand border border-transparent hover:bg-brand-hover",
} as const;

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
  /** Lucide icon name. */
  icon: string;
  /** Required: becomes both title and aria-label (German). */
  label: string;
  /** ghost = row/toolbar default · outline = standalone next to inputs · solid = indigo, rare. */
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
}

export function IconButton({
  icon,
  label,
  variant = "ghost",
  size = "md",
  disabled = false,
  className,
  ...rest
}: IconButtonProps) {
  const s = SIZES[size] ?? SIZES.md;
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      className={cn(
        "inline-grid cursor-pointer place-items-center rounded-md p-0 transition duration-[120ms] ease-out",
        "focus-visible:outline-none focus-visible:[box-shadow:var(--ring-brand)]",
        "disabled:cursor-not-allowed disabled:opacity-45",
        s.box,
        VARIANTS[variant] ?? VARIANTS.ghost,
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={s.glyph} />
    </button>
  );
}
