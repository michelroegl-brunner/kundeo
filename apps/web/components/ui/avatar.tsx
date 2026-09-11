import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

const SIZES = { xs: 20, sm: 26, md: 32, lg: 40, xl: 56 } as const;

const TONES = {
  brand: "bg-surface-brand-subtle text-content-brand",
  neutral: "bg-surface-sunken text-content-secondary",
  solid: "bg-brand text-on-brand",
} as const;

function initials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

export interface AvatarProps {
  /** Full name — initials are derived from first + last word. */
  name?: string;
  /** Optional image URL (User.image). Falls back to initials. */
  src?: string;
  /** xs 20 · sm 26 · md 32 · lg 40 · xl 56 px. */
  size?: keyof typeof SIZES;
  /** brand = indigo tint (default) · neutral = grey · solid = filled indigo. */
  tone?: keyof typeof TONES;
  className?: string;
  style?: CSSProperties;
}

export function Avatar({ name = "", src, size = "md", tone = "brand", className, style }: AvatarProps) {
  const px = SIZES[size] ?? SIZES.md;
  return (
    <span
      title={name || undefined}
      className={cn(
        "inline-grid flex-none place-items-center overflow-hidden rounded-full font-sans font-semibold",
        src ? "bg-surface-sunken" : TONES[tone] ?? TONES.brand,
        className,
      )}
      style={{
        width: px,
        height: px,
        fontSize: Math.max(9, Math.round(px * 0.38)),
        letterSpacing: "0.01em",
        ...style,
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}
