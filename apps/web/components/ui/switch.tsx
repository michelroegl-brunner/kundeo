"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (next: boolean) => void;
  label?: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Switch({ checked, defaultChecked, onChange, label, hint, disabled = false, className, style }: SwitchProps) {
  const [internal, setInternal] = useState(!!defaultChecked);
  const on = checked !== undefined ? checked : internal;
  const toggle = () => {
    if (disabled) return;
    if (checked === undefined) setInternal(!on);
    onChange?.(!on);
  };
  return (
    <label
      onClick={toggle}
      className={cn(
        "inline-flex gap-2.5",
        hint ? "items-start" : "items-center",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        className,
      )}
      style={style}
    >
      <span
        role="switch"
        aria-checked={on}
        className={cn(
          "relative h-5 w-9 flex-none rounded-full transition-[background-color] duration-[180ms] ease-out",
          on ? "bg-brand" : "bg-neutral-300",
          hint && "mt-0.5",
        )}
      >
        <span
          className="absolute top-0.5 h-4 w-4 rounded-full bg-neutral-0 shadow-xs transition-[left] duration-[180ms] ease-out"
          style={{ left: on ? 18 : 2 }}
        />
      </span>
      {label || hint ? (
        <span className="flex flex-col gap-0.5">
          {label ? <span className="font-sans text-sm text-content">{label}</span> : null}
          {hint ? <span className="font-sans text-xs text-content-muted">{hint}</span> : null}
        </span>
      ) : null}
    </label>
  );
}
