import type { CSSProperties, MouseEventHandler, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";

export interface TagProps {
  children?: ReactNode;
  /** Tag.color from the database (hex). Renders as the leading 7px dot. */
  color?: string;
  /** Pass a handler to show the remove affordance. */
  onRemove?: MouseEventHandler<HTMLButtonElement>;
  className?: string;
  style?: CSSProperties;
}

export function Tag({ children, color = "var(--kundeo-indigo)", onRemove, className, style }: TagProps) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border border-edge bg-surface-card font-sans text-xs font-medium text-content-secondary",
        onRemove ? "pl-2.5 pr-1.5" : "px-2.5",
        className,
      )}
      style={style}
    >
      <span className="h-[7px] w-[7px] rounded-full" style={{ background: color }} />
      {children}
      {onRemove ? (
        <button
          type="button"
          aria-label="Tag entfernen"
          onClick={onRemove}
          className="grid h-4 w-4 cursor-pointer place-items-center rounded-full border-0 bg-transparent p-0 text-content-subtle hover:text-content-secondary"
        >
          <Icon name="x" size={11} />
        </button>
      ) : null}
    </span>
  );
}
