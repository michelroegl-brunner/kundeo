"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const PLACEMENTS: Record<string, CSSProperties> = {
  top: { bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)" },
  bottom: { top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)" },
  left: { right: "calc(100% + 6px)", top: "50%", transform: "translateY(-50%)" },
  right: { left: "calc(100% + 6px)", top: "50%", transform: "translateY(-50%)" },
};

export interface TooltipProps {
  /** Short German label — 1-4 words, no full stop. */
  label: ReactNode;
  children?: ReactNode;
  placement?: "top" | "bottom" | "left" | "right";
  className?: string;
  style?: CSSProperties;
}

export function Tooltip({ label, children, placement = "top", className, style }: TooltipProps) {
  const [open, setOpen] = useState(false);
  return (
    <span
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      className={cn("relative inline-flex", className)}
      style={style}
    >
      {children}
      {open ? (
        <span
          role="tooltip"
          className="pointer-events-none absolute z-40 whitespace-nowrap rounded-sm bg-neutral-900 px-2 py-[5px] font-sans text-2xs font-medium tracking-snug text-neutral-0 shadow-md"
          style={PLACEMENTS[placement] ?? PLACEMENTS.top}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}
