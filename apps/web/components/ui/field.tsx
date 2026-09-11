import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface FieldProps {
  /** German label, sentence case, no colon. */
  label?: ReactNode;
  htmlFor?: string;
  /** Helper text shown when there is no error. */
  hint?: ReactNode;
  /** Error message; replaces the hint and takes the danger colour. */
  error?: ReactNode;
  required?: boolean;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function Field({ label, htmlFor, hint, error, required = false, children, className, style }: FieldProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)} style={style}>
      {label ? (
        <label htmlFor={htmlFor} className="font-sans text-xs font-medium text-content-secondary">
          {label}
          {required ? <span className="ml-[3px] text-danger">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="font-sans text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="font-sans text-xs text-content-muted">{hint}</p>
      ) : null}
    </div>
  );
}
