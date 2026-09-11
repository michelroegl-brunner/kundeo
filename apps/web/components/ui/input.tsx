import type { CSSProperties, InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";

const SIZES = {
  sm: "h-[var(--control-height-sm)]",
  md: "h-[var(--control-height-md)]",
  lg: "h-[var(--control-height-lg)]",
} as const;

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "style"> {
  size?: keyof typeof SIZES;
  /** Lucide icon inside the field, left — e.g. "search", "mail". */
  iconLeft?: string;
  /** Trailing unit rendered in mono, e.g. "EUR", "%". */
  suffix?: string;
  invalid?: boolean;
  /** Mono + tabular figures — use for amounts, VAT IDs, postal codes. */
  mono?: boolean;
  align?: "left" | "right";
  fullWidth?: boolean;
  /** Applied to the outer field wrapper. */
  className?: string;
  style?: CSSProperties;
}

export function Input({
  size = "md",
  iconLeft,
  suffix,
  invalid = false,
  disabled = false,
  mono = false,
  align = "left",
  fullWidth = true,
  type = "text",
  className,
  style,
  ...rest
}: InputProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-md border px-2.5 text-content transition duration-[120ms] ease-out",
        SIZES[size] ?? SIZES.md,
        disabled ? "bg-surface-sunken" : "bg-surface-card",
        invalid
          ? "border-edge-danger focus-within:[box-shadow:var(--ring-danger)]"
          : "border-edge focus-within:border-edge-focus focus-within:[box-shadow:var(--ring-brand)]",
        fullWidth && "w-full",
        className,
      )}
      style={style}
    >
      {iconLeft ? <Icon name={iconLeft} size={15} color="var(--text-subtle)" /> : null}
      <input
        type={type}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className={cn(
          "min-w-0 flex-1 border-0 bg-transparent text-sm text-inherit outline-none placeholder:text-content-subtle",
          mono ? "font-mono tabular-nums" : "font-sans",
          align === "right" ? "text-right" : "text-left",
        )}
        {...rest}
      />
      {suffix ? <span className="font-mono text-xs text-content-muted">{suffix}</span> : null}
    </div>
  );
}
