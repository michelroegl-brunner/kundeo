import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";

export interface SidebarNavItem {
  /** Route key. */
  id?: string;
  label?: string;
  /** Lucide icon name, rendered at 17px. */
  icon?: string;
  /** Optional right-aligned count in mono. */
  count?: number;
  /** Pass { section: "Label" } instead of an item to render a group heading. */
  section?: string;
}

export interface SidebarNavProps {
  items: SidebarNavItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
  /** Org switcher slot, above the items. */
  header?: ReactNode;
  /** Pushed to the bottom — user row, settings link. */
  footer?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function SidebarNav({ items = [], activeId, onSelect, header, footer, className, style }: SidebarNavProps) {
  return (
    <nav className={cn("flex min-w-0 flex-col gap-1 p-3", className)} style={style}>
      {header}
      {items.map((item, i) =>
        item.section ? (
          <div
            key={`s-${item.section}-${i}`}
            className="px-2 pb-1 pt-4 font-sans text-2xs font-semibold uppercase tracking-wide text-content-subtle"
          >
            {item.section}
          </div>
        ) : (
          <SidebarItem key={item.id} item={item} active={item.id === activeId} onSelect={onSelect} />
        ),
      )}
      {footer ? <div className="mt-auto">{footer}</div> : null}
    </nav>
  );
}

function SidebarItem({
  item,
  active,
  onSelect,
}: {
  item: SidebarNavItem;
  active: boolean;
  onSelect?: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => item.id && onSelect?.(item.id)}
      className={cn(
        "flex h-[34px] w-full cursor-pointer items-center gap-3 rounded-md border-0 px-2 text-left font-sans text-sm transition duration-[120ms] ease-out",
        active
          ? "bg-surface-brand-subtle font-semibold text-content-brand"
          : "bg-transparent font-medium text-content-secondary hover:bg-surface-hover",
      )}
    >
      {item.icon ? <Icon name={item.icon} size={17} /> : null}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.count != null ? (
        <span className={cn("font-mono text-2xs tabular-nums", active ? "text-content-brand" : "text-content-subtle")}>
          {item.count}
        </span>
      ) : null}
    </button>
  );
}
