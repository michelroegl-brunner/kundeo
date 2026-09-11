"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";
import { Checkbox } from "./checkbox";

export interface DataTableColumn<Row> {
  key: string;
  /** Uppercase 11px column head (German). */
  label?: string;
  align?: "left" | "right" | "center";
  /** Mono + tabular figures — amounts, dates, IDs. */
  mono?: boolean;
  /** Muted text colour for secondary columns. */
  muted?: boolean;
  width?: number | string;
  /** Sort indicator on this column. */
  sorted?: "asc" | "desc";
  /** Custom cell renderer; receives the row. */
  render?: (row: Row) => ReactNode;
}

export interface DataTableProps<Row extends { id: string }> {
  columns: DataTableColumn<Row>[];
  /** Each row needs a unique `id`. */
  rows: Row[];
  /** Adds the leading checkbox column with header select-all. */
  selectable?: boolean;
  onRowClick?: (row: Row) => void;
  /** Rendered instead of the table when rows is empty — pass an EmptyState. */
  emptyState?: ReactNode;
  /** 38px rows instead of 46px. */
  dense?: boolean;
  className?: string;
  style?: CSSProperties;
}

const ALIGN = { left: "text-left", right: "text-right", center: "text-center" } as const;

export function DataTable<Row extends { id: string }>({
  columns = [],
  rows = [],
  selectable = false,
  onRowClick,
  emptyState,
  dense = false,
  className,
  style,
}: DataTableProps<Row>) {
  const [selected, setSelected] = useState<string[]>([]);
  const rowH = dense ? 38 : 46;
  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  if (!rows.length && emptyState) return <div className={className} style={style}>{emptyState}</div>;

  return (
    <div className={cn("w-full overflow-x-auto", className)} style={style}>
      <table className="w-full border-collapse font-sans">
        <thead>
          <tr>
            {selectable ? (
              <th className="h-9 w-10 border-b border-edge pl-4">
                <Checkbox
                  checked={selected.length === rows.length && rows.length > 0}
                  indeterminate={selected.length > 0 && selected.length < rows.length}
                  onChange={(on) => setSelected(on ? rows.map((r) => r.id) : [])}
                />
              </th>
            ) : null}
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "h-9 whitespace-nowrap border-b border-edge bg-surface-card px-4 text-2xs font-semibold uppercase tracking-wide text-content-muted",
                  ALIGN[c.align ?? "left"],
                )}
                style={{ width: c.width }}
              >
                <span className="inline-flex items-center gap-1">
                  {c.label}
                  {c.sorted ? <Icon name={c.sorted === "desc" ? "arrow-down" : "arrow-up"} size={12} /> : null}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const checked = selected.includes(r.id);
            return (
              <tr
                key={r.id}
                onClick={() => onRowClick?.(r)}
                className={cn(
                  "transition-[background-color] duration-[120ms] ease-out",
                  checked ? "bg-surface-brand-subtle" : "hover:bg-surface-hover",
                  onRowClick ? "cursor-pointer" : "cursor-default",
                )}
              >
                {selectable ? (
                  <td
                    className="border-b border-edge-subtle pl-4"
                    style={{ height: rowH }}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(r.id);
                    }}
                  >
                    <Checkbox checked={checked} onChange={() => toggle(r.id)} />
                  </td>
                ) : null}
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "whitespace-nowrap border-b border-edge-subtle px-4 text-sm",
                      ALIGN[c.align ?? "left"],
                      c.muted ? "text-content-muted" : "text-content",
                      c.mono ? "font-mono tabular-nums" : "font-sans",
                    )}
                    style={{ height: rowH }}
                  >
                    {c.render ? c.render(r) : (r as Record<string, ReactNode>)[c.key]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
