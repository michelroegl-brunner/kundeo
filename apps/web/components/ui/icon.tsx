import type { CSSProperties } from "react";
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bell,
  BookOpen,
  Building2,
  Calendar,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  CircleCheck,
  CircleX,
  Clock,
  Download,
  EllipsisVertical,
  ExternalLink,
  Filter,
  GitBranch,
  GripVertical,
  IdCard,
  Info,
  Inbox,
  Kanban,
  LayoutDashboard,
  ListChecks,
  LoaderCircle,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Minus,
  Pencil,
  Phone,
  Plus,
  Scale,
  Search,
  Send,
  Server,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  StickyNote,
  Target,
  Terminal,
  Trash2,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  User,
  UserCog,
  UserMinus,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

/**
 * Thin wrapper over lucide-react, addressed by kebab-case name so callers read
 * like the design system (`<Icon name="building-2" />`). Kundeo ships no icons
 * of its own; Lucide (24px grid, 2px stroke, round caps) is the substituted set
 * — it matches the round-capped strokes of the Kundeo mark. Icons inherit the
 * current text colour unless `color` is set. The map is explicit so only the
 * glyphs we use land in the bundle and every one is server-renderable.
 */
const ICONS: Record<string, LucideIcon> = {
  "layout-dashboard": LayoutDashboard,
  kanban: Kanban,
  users: Users,
  user: User,
  "user-cog": UserCog,
  "user-plus": UserPlus,
  "user-minus": UserMinus,
  "building-2": Building2,
  target: Target,
  activity: Activity,
  calendar: Calendar,
  "calendar-days": CalendarDays,
  "calendar-plus": CalendarPlus,
  phone: Phone,
  mail: Mail,
  "sticky-note": StickyNote,
  "list-checks": ListChecks,
  search: Search,
  filter: Filter,
  plus: Plus,
  pencil: Pencil,
  "trash-2": Trash2,
  check: Check,
  "circle-check": CircleCheck,
  "circle-x": CircleX,
  "triangle-alert": TriangleAlert,
  info: Info,
  clock: Clock,
  settings: Settings,
  bell: Bell,
  "log-out": LogOut,
  "chevron-down": ChevronDown,
  "chevron-right": ChevronRight,
  "chevrons-up-down": ChevronsUpDown,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  "arrow-up": ArrowUp,
  "arrow-down": ArrowDown,
  x: X,
  minus: Minus,
  inbox: Inbox,
  "id-card": IdCard,
  "external-link": ExternalLink,
  server: Server,
  "shield-check": ShieldCheck,
  "map-pin": MapPin,
  terminal: Terminal,
  github: GitBranch, // lucide dropped the GitHub brand mark; closest neutral glyph
  "book-open": BookOpen,
  lock: Lock,
  "loader-circle": LoaderCircle,
  "trending-up": TrendingUp,
  "trending-down": TrendingDown,
  sparkles: Sparkles,
  star: Star,
  scale: Scale,
  "ellipsis-vertical": EllipsisVertical,
  "grip-vertical": GripVertical,
  send: Send,
  download: Download,
};

export interface IconProps {
  /** Kebab-case Lucide name, e.g. "building-2", "loader-circle". */
  name: string;
  /** Pixel size (width = height). 16 default; 12 in badges, 17 in the sidebar. */
  size?: number;
  /** Overrides the inherited text colour; semantic use only. */
  color?: string;
  className?: string;
  style?: CSSProperties;
  /** When set, the glyph is exposed to assistive tech with this label. */
  title?: string;
}

export function Icon({ name, size = 16, color, className, style, title }: IconProps) {
  const Glyph = ICONS[name];
  if (!Glyph) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`Icon: unknown name "${name}" — add it to components/ui/icon.tsx`);
    }
    return (
      <span
        aria-hidden
        className={className}
        style={{ display: "inline-flex", flex: "0 0 auto", width: size, height: size, ...style }}
      />
    );
  }
  return (
    <Glyph
      size={size}
      color={color}
      className={className}
      style={{ flex: "0 0 auto", ...style }}
      strokeWidth={2}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      role={title ? "img" : undefined}
    />
  );
}
