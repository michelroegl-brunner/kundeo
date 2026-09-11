"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";

export interface CheckboxProps {
  /** Controlled state. Omit to use defaultChecked. */
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (next: boolean, event: unknown) => void;
  label?: ReactNode;
  /** Second line under the label, muted. */
  hint?: ReactNode;
  /** Dash glyph for partial table selection. */
  indeterminate?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
  style?: CSSProperties;
}

export function Checkbox({
  checked,
  defaultChecked,
  onChange,
  label,
  hint,
  indeterminate = false,
  disabled = false,
  id,
  className,
  style,
}: CheckboxProps) {
  const [internal, setInternal] = useState(!!defaultChecked);
  const on = checked !== undefined ? checked : internal;
  const toggle = (e: React.SyntheticEvent) => {
    if (disabled) return;
    if (checked === undefined) setInternal(!on);
    onChange?.(!on, e);
  };
  return (
    <label
      htmlFor={id}
      onClick={(e) => {
        e.preventDefault();
        toggle(e);
      }}
      className={cn(
        "inline-flex gap-[9px]",
        hint ? "items-start" : "items-center",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        className,
      )}
      style={style}
    >
      <span
        className={cn(
          "grid h-[17px] w-[17px] flex-none place-items-center rounded-xs border text-on-brand transition duration-[120ms] ease-out",
          on || indeterminate ? "border-brand bg-brand" : "border-edge-strong bg-surface-card",
          hint && "mt-px",
        )}
      >
        {indeterminate ? <Icon name="minus" size={12} /> : on ? <Icon name="check" size={12} /> : null}
      </span>
      {label || hint ? (
        <span className="flex flex-col gap-0.5">
          {label ? <span className="font-sans text-sm text-content">{label}</span> : null}
          {hint ? <span className="font-sans text-xs text-content-muted">{hint}</span> : null}
        </span>
      ) : null}
      <input id={id} type="checkbox" checked={on} readOnly disabled={disabled} className="absolute h-0 w-0 opacity-0" />
    </label>
  );
}
