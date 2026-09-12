"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@kundeo/auth/client";
import { SidebarNav, type SidebarNavItem } from "@/components/ui/sidebar-nav";
import { Avatar } from "@/components/ui/avatar";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";

/** Nav id ↔ route. English routes, German labels (per the terminology table). */
type NavItem = SidebarNavItem & { href?: string };

// The Belege section (FreeFinance) is only shown when the integration is
// connected — it is an additive, capability-gated layer.
const BELEGE_NAV: NavItem[] = [
  { section: "Belege" },
  { id: "products", label: "Produkte", icon: "package", href: "/products" },
  { id: "offers", label: "Angebote", icon: "file-text", href: "/offers" },
  { id: "invoices", label: "Rechnungen", icon: "receipt", href: "/invoices" },
];

function buildNav(showBelege: boolean): NavItem[] {
  return [
    { id: "dashboard", label: "Übersicht", icon: "layout-dashboard", href: "/dashboard" },
    { section: "Vertrieb" },
    { id: "pipeline", label: "Pipeline", icon: "kanban", href: "/deals" },
    { id: "contacts", label: "Kontakte", icon: "users", href: "/contacts" },
    { id: "companies", label: "Firmen", icon: "building-2", href: "/companies" },
    { id: "activities", label: "Aktivitäten", icon: "activity", href: "/activities" },
    ...(showBelege ? BELEGE_NAV : []),
    { section: "Automatisierung" },
    { id: "automations", label: "Automationen", icon: "workflow", href: "/automationen" },
    { section: "Organisation" },
    { id: "team", label: "Team", icon: "user-cog", href: "/team" },
    { id: "settings", label: "Einstellungen", icon: "settings", href: "/settings" },
  ];
}

const DEFAULT_TITLES: Record<string, string> = {
  dashboard: "Übersicht",
  pipeline: "Pipeline",
  contacts: "Kontakte",
  companies: "Firmen",
  activities: "Aktivitäten",
  products: "Produkte",
  offers: "Angebote",
  invoices: "Rechnungen",
  automations: "Automationen",
  team: "Team",
  settings: "Einstellungen",
};

function activeIdFor(pathname: string): string {
  if (pathname.startsWith("/deals")) return "pipeline";
  if (pathname.startsWith("/contacts")) return "contacts";
  if (pathname.startsWith("/companies")) return "companies";
  if (pathname.startsWith("/activities")) return "activities";
  if (pathname.startsWith("/products")) return "products";
  if (pathname.startsWith("/offers")) return "offers";
  if (pathname.startsWith("/invoices")) return "invoices";
  if (pathname.startsWith("/automationen")) return "automations";
  if (pathname.startsWith("/team")) return "team";
  if (pathname.startsWith("/settings")) return "settings";
  return "dashboard";
}

interface Chrome {
  title?: ReactNode;
  breadcrumb?: string[];
  actions?: ReactNode;
}

const ChromeContext = createContext<(c: Chrome) => void>(() => {});

/**
 * Lets a page set the topbar title, breadcrumb and primary actions. Rendered
 * (invisibly) at the top of a page; interactive `actions` must be their own
 * client components.
 */
export function PageHeader({ title, breadcrumb, actions }: Chrome) {
  const set = useContext(ChromeContext);
  useEffect(() => {
    set({ title, breadcrumb, actions });
    return () => set({});
  }, [set, title, breadcrumb, actions]);
  return null;
}

export function AppShell({
  org,
  user,
  freeFinanceConnected = false,
  children,
}: {
  org: { name: string; slug: string };
  user: { name: string; email: string };
  /** Shows the Belege section (Produkte/Angebote/Rechnungen) when connected. */
  freeFinanceConnected?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [chrome, setChrome] = useState<Chrome>({});
  const setChromeCb = useCallback((c: Chrome) => setChrome(c), []);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Close the mobile drawer whenever the route changes (nav tap or otherwise).
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // While the drawer is open, close on Escape and lock the body scroll.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileNavOpen(false);
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileNavOpen]);

  const nav = buildNav(freeFinanceConnected);
  const routes: Record<string, string> = Object.fromEntries(
    nav.filter((n) => n.id && n.href).map((n) => [n.id as string, n.href as string]),
  );
  const activeId = activeIdFor(pathname);
  const title = chrome.title ?? DEFAULT_TITLES[activeId] ?? "";

  async function signOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <ChromeContext.Provider value={setChromeCb}>
      <div className="grid h-screen grid-cols-[var(--sidebar-width)_1fr] bg-surface-page font-sans max-md:grid-cols-1">
        <aside className="flex min-w-0 flex-col border-r border-edge bg-surface-card max-md:hidden">
          <SidebarNav
            className="flex-1"
            activeId={activeId}
            onSelect={(id) => routes[id] && router.push(routes[id])}
            header={<OrgSwitcher org={org} />}
            items={nav}
          />
          <UserRow user={user} onSignOut={signOut} />
        </aside>

        <div className="flex min-w-0 flex-col overflow-hidden">
          <header className="flex h-[var(--topbar-height)] flex-none items-center gap-4 border-b border-edge bg-surface-card px-4 md:px-6">
            <IconButton
              icon="menu"
              label="Menü öffnen"
              variant="ghost"
              className="md:hidden"
              onClick={() => setMobileNavOpen(true)}
            />
            <div className="min-w-0 flex-1">
              {chrome.breadcrumb?.length ? (
                <div className="mb-px flex items-center gap-[5px] text-2xs text-content-subtle">
                  {chrome.breadcrumb.map((b, i) => (
                    <span key={`${b}-${i}`} className="inline-flex items-center gap-[5px]">
                      {i > 0 ? <Icon name="chevron-right" size={11} /> : null}
                      <span>{b}</span>
                    </span>
                  ))}
                </div>
              ) : null}
              <h1 className="truncate text-lg font-semibold tracking-snug text-content">{title}</h1>
            </div>
            <Input
              size="sm"
              iconLeft="search"
              placeholder="Suchen …"
              fullWidth={false}
              className="w-[220px] max-sm:hidden"
            />
            <IconButton icon="bell" label="Benachrichtigungen" variant="outline" />
            {chrome.actions}
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
            <div className="mx-auto flex max-w-[var(--content-max)] flex-col gap-5">{children}</div>
          </main>
        </div>

        <MobileNavDrawer
          open={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
          org={org}
          user={user}
          nav={nav}
          activeId={activeId}
          onSelect={(id) => routes[id] && router.push(routes[id])}
          onSignOut={signOut}
        />
      </div>
    </ChromeContext.Provider>
  );
}

/**
 * Slide-in navigation for mobile (< md), where the fixed sidebar is hidden.
 * Mirrors the desktop sidebar — org switcher, nav, user row — as an overlay
 * drawer so every route stays reachable by touch.
 */
function MobileNavDrawer({
  open,
  onClose,
  org,
  user,
  nav,
  activeId,
  onSelect,
  onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  org: { name: string; slug: string };
  user: { name: string; email: string };
  nav: NavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  onSignOut: () => void;
}) {
  return (
    <div className="md:hidden" role="dialog" aria-modal="true" aria-label="Navigation" hidden={!open}>
      <button
        type="button"
        aria-label="Menü schließen"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-black/40 [animation:fade-in_120ms_ease-out]"
      />
      <aside className="fixed inset-y-0 left-0 z-50 flex w-[min(84vw,var(--sidebar-width))] flex-col border-r border-edge bg-surface-card [animation:slide-in-left_160ms_ease-out]">
        <div className="flex items-center justify-between gap-2 px-3 pt-3">
          <span className="min-w-0 flex-1">
            <OrgSwitcher org={org} />
          </span>
          <IconButton icon="x" label="Menü schließen" variant="ghost" onClick={onClose} />
        </div>
        <SidebarNav
          className="flex-1 overflow-y-auto pt-0"
          activeId={activeId}
          onSelect={onSelect}
          items={nav}
        />
        <UserRow user={user} onSignOut={onSignOut} />
      </aside>
    </div>
  );
}

function OrgSwitcher({ org }: { org: { name: string; slug: string } }) {
  return (
    <button
      type="button"
      className="mb-1 flex w-full cursor-pointer items-center gap-2.5 rounded-md border border-edge bg-surface-card p-2 text-left transition duration-[120ms] ease-out hover:bg-surface-hover"
    >
      <Image src="/kundeo-icon.svg" alt="" width={26} height={26} className="rounded-[7px]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-content">{org.name}</span>
        <span className="block font-mono text-2xs text-content-subtle">{org.slug}</span>
      </span>
      <Icon name="chevrons-up-down" size={14} color="var(--text-subtle)" />
    </button>
  );
}

function UserRow({
  user,
  onSignOut,
}: {
  user: { name: string; email: string };
  onSignOut: () => void;
}) {
  return (
    <div className="flex items-center gap-[9px] border-t border-edge-subtle p-2">
      <Avatar name={user.name} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-content">{user.name}</span>
        <span className="block truncate text-2xs text-content-subtle">{user.email}</span>
      </span>
      <IconButton icon="log-out" label="Abmelden" size="sm" onClick={onSignOut} />
    </div>
  );
}
