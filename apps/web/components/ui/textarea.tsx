import type { CSSProperties, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "style"> {
  /** Default 4; use 3 for the activity composer, 6+ for Notes. */
  rows?: number;
  invalid?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Textarea({ rows = 4, invalid = false, disabled = false, className, style, ...rest }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      className={cn(
        "w-full resize-y rounded-md border px-2.5 py-[9px] font-sans text-sm leading-normal text-content outline-none transition duration-[120ms] ease-out placeholder:text-content-subtle",
        disabled ? "bg-surface-sunken" : "bg-surface-card",
        invalid
          ? "border-edge-danger focus:[box-shadow:var(--ring-danger)]"
          : "border-edge focus:border-edge-focus focus:[box-shadow:var(--ring-brand)]",
        className,
      )}
      style={style}
      {...rest}
    />
  );
}
