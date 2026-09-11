"use client";

import { useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";

export interface TabItem {
  id: string;
  label: string;
  /** Lucide icon name at 15px. */
  icon?: string;
  count?: number;
}

export interface TabsProps {
  tabs: TabItem[];
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  className?: string;
  style?: CSSProperties;
}

export function Tabs({ tabs = [], value, defaultValue, onChange, className, style }: TabsProps) {
  const [internal, setInternal] = useState(defaultValue || tabs[0]?.id);
  const current = value !== undefined ? value : internal;
  return (
    <div className={cn("flex gap-5 border-b border-edge", className)} style={style}>
      {tabs.map((t) => {
        const on = t.id === current;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              if (value === undefined) setInternal(t.id);
              onChange?.(t.id);
            }}
            className={cn(
              "-mb-px inline-flex cursor-pointer items-center gap-[7px] border-0 border-b-2 bg-transparent pb-2.5 font-sans text-sm transition duration-[120ms] ease-out",
              on ? "border-brand font-semibold text-content" : "border-transparent font-medium text-content-muted hover:text-content-secondary",
            )}
          >
            {t.icon ? <Icon name={t.icon} size={15} /> : null}
            {t.label}
            {t.count != null ? (
              <span className="font-mono text-2xs tabular-nums text-content-subtle">{t.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
