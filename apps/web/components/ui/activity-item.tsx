import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";

const TYPES = {
  NOTE: { icon: "sticky-note", color: "var(--neutral-400)", label: "Notiz" },
  CALL: { icon: "phone", color: "var(--kundeo-indigo)", label: "Anruf" },
  EMAIL: { icon: "mail", color: "var(--kundeo-indigo)", label: "E-Mail" },
  MEETING: { icon: "calendar-days", color: "var(--kundeo-amber)", label: "Termin" },
  TASK: { icon: "circle-check", color: "var(--kundeo-green)", label: "Aufgabe" },
} as const;

export interface ActivityItemProps {
  /** ActivityType from the schema — picks icon, colour and fallback label. */
  type?: keyof typeof TYPES;
  /** Activity.subject. */
  subject?: string;
  /** Activity.body — 2-3 lines in the feed. */
  body?: string;
  /** Author name line, e.g. "Anna Weber". */
  author?: string;
  /** Pre-formatted date/time, mono ("14.03.2026, 09:12"). */
  timestamp?: string;
  /** completedAt set → struck through. */
  done?: boolean;
  /** Last item in the feed: hides the connector line. */
  last?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function ActivityItem({ type = "NOTE", subject, body, author, timestamp, done = false, last = false, className, style }: ActivityItemProps) {
  const t = TYPES[type] ?? TYPES.NOTE;
  return (
    <div className={cn("flex gap-3", className)} style={style}>
      <div className="flex flex-none flex-col items-center">
        <span
          className="grid h-7 w-7 place-items-center rounded-full border border-edge bg-surface-card"
          style={{ color: t.color }}
        >
          <Icon name={t.icon} size={14} />
        </span>
        {!last ? <span className="mt-1 w-px flex-1 bg-edge" /> : null}
      </div>
      <div className={cn("min-w-0 flex-1", last ? "pb-0" : "pb-5")}>
        <div className="flex flex-wrap items-baseline gap-2">
          <p
            className={cn(
              "font-sans text-sm font-medium text-content",
              done && "line-through opacity-60",
            )}
          >
            {subject || t.label}
          </p>
          {timestamp ? (
            <span className="font-mono text-2xs tabular-nums text-content-subtle">{timestamp}</span>
          ) : null}
        </div>
        {body ? <p className="mt-[3px] font-sans text-xs leading-normal text-content-secondary">{body}</p> : null}
        {author ? <p className="mt-[5px] font-sans text-2xs text-content-subtle">{author}</p> : null}
      </div>
    </div>
  );
}
