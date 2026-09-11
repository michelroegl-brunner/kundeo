import type { CSSProperties, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";

const SIZES = {
  sm: "h-[var(--control-height-sm)]",
  md: "h-[var(--control-height-md)]",
  lg: "h-[var(--control-height-lg)]",
} as const;

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size" | "style"> {
  /** Strings or {value,label} objects. */
  options?: (string | SelectOption)[];
  /** Empty-value first option, e.g. "Bitte wählen". */
  placeholder?: string;
  size?: keyof typeof SIZES;
  invalid?: boolean;
  fullWidth?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Select({
  options = [],
  placeholder,
  size = "md",
  disabled = false,
  invalid = false,
  fullWidth = true,
  className,
  style,
  ...rest
}: SelectProps) {
  return (
    <div
      className={cn(
        "relative flex min-w-0 items-center rounded-md border transition duration-[120ms] ease-out",
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
      <select
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className="h-full min-w-0 flex-1 cursor-pointer appearance-none border-0 bg-transparent pl-2.5 pr-[30px] font-sans text-sm text-content outline-none disabled:cursor-not-allowed"
        {...rest}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((o) => {
          const opt = typeof o === "string" ? { value: o, label: o } : o;
          return (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          );
        })}
      </select>
      <Icon
        name="chevron-down"
        size={15}
        color="var(--text-subtle)"
        className="pointer-events-none absolute right-[9px]"
      />
    </div>
  );
}
