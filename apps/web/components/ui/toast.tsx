import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";
import { IconButton } from "./icon-button";

const TONES = {
  success: { icon: "circle-check", color: "var(--text-success)" },
  info: { icon: "info", color: "var(--text-brand)" },
  warning: { icon: "triangle-alert", color: "var(--text-warning)" },
  danger: { icon: "circle-x", color: "var(--text-danger)" },
} as const;

export interface ToastProps {
  /** success = saved · info = neutral · warning = attention · danger = failed. */
  tone?: keyof typeof TONES;
  /** One short German sentence, past tense for confirmations. */
  title?: ReactNode;
  description?: ReactNode;
  /** Optional inline action, usually a ghost Button ("Rückgängig"). */
  action?: ReactNode;
  onClose?: () => void;
  className?: string;
  style?: CSSProperties;
}

export function Toast({ tone = "info", title, description, action, onClose, className, style }: ToastProps) {
  const t = TONES[tone] ?? TONES.info;
  return (
    <div
      role="status"
      className={cn(
        "flex w-[380px] items-start gap-3 rounded-lg border border-edge bg-surface-card px-4 py-3 shadow-lg",
        className,
      )}
      style={style}
    >
      <Icon name={t.icon} size={17} color={t.color} className="mt-px" />
      <div className="min-w-0 flex-1">
        <p className="font-sans text-sm font-medium text-content">{title}</p>
        {description ? (
          <p className="mt-0.5 font-sans text-xs leading-normal text-content-muted">{description}</p>
        ) : null}
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
      {onClose ? <IconButton icon="x" label="Schließen" size="sm" onClick={onClose} /> : null}
    </div>
  );
}
