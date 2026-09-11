"use client";

import { useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

export interface RadioOption {
  value: string;
  label: string;
  /** Optional muted second line. */
  hint?: string;
}

export interface RadioProps {
  options: (string | RadioOption)[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  /** "row" for 2-3 short options, "column" (default) otherwise. */
  direction?: "row" | "column";
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Radio({
  options = [],
  value,
  defaultValue,
  onChange,
  name,
  direction = "column",
  disabled = false,
  className,
  style,
}: RadioProps) {
  const [internal, setInternal] = useState(defaultValue);
  const current = value !== undefined ? value : internal;
  return (
    <div
      className={cn("flex", direction === "row" ? "flex-row gap-5" : "flex-col gap-3", className)}
      style={style}
    >
      {options.map((o) => {
        const opt = typeof o === "string" ? { value: o, label: o, hint: undefined } : o;
        const on = current === opt.value;
        return (
          <label
            key={opt.value}
            onClick={() => {
              if (disabled) return;
              if (value === undefined) setInternal(opt.value);
              onChange?.(opt.value);
            }}
            className={cn(
              "inline-flex items-start gap-[9px]",
              disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
            )}
          >
            <span
              className={cn(
                "mt-px grid h-[17px] w-[17px] flex-none place-items-center rounded-full border bg-surface-card transition duration-[120ms] ease-out",
                on ? "border-brand" : "border-edge-strong",
              )}
            >
              {on ? <span className="h-[9px] w-[9px] rounded-full bg-brand" /> : null}
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="font-sans text-sm text-content">{opt.label}</span>
              {opt.hint ? <span className="font-sans text-xs text-content-muted">{opt.hint}</span> : null}
            </span>
            <input type="radio" name={name} checked={on} readOnly className="absolute h-0 w-0 opacity-0" />
          </label>
        );
      })}
    </div>
  );
}
