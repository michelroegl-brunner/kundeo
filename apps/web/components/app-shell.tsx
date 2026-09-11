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
const NAV: (SidebarNavItem & { href?: string })[] = [
  { id: "dashboard", label: "Übersicht", icon: "layout-dashboard", href: "/dashboard" },
  { section: "Vertrieb" },
  { id: "pipeline", label: "Pipeline", icon: "kanban", href: "/deals" },
  { id: "contacts", label: "Kontakte", icon: "users", href: "/contacts" },
  { id: "companies", label: "Firmen", icon: "building-2", href: "/companies" },
  { id: "activities", label: "Aktivitäten", icon: "activity", href: "/activities" },
  { section: "Automatisierung" },
  { id: "automations", label: "Automationen", icon: "workflow", href: "/automationen" },
  { section: "Organisation" },
  { id: "team", label: "Team", icon: "user-cog", href: "/team" },
  { id: "settings", label: "Einstellungen", icon: "settings", href: "/settings" },
];

const ROUTES: Record<string, string> = Object.fromEntries(
  NAV.filter((n) => n.id && n.href).map((n) => [n.id as string, n.href as string]),
);

const DEFAULT_TITLES: Record<string, string> = {
  dashboard: "Übersicht",
  pipeline: "Pipeline",
  contacts: "Kontakte",
  companies: "Firmen",
  activities: "Aktivitäten",
  automations: "Automationen",
  team: "Team",
  settings: "Einstellungen",
};

function activeIdFor(pathname: string): string {
  if (pathname.startsWith("/deals")) return "pipeline";
  if (pathname.startsWith("/contacts")) return "contacts";
  if (pathname.startsWith("/companies")) return "companies";
  if (pathname.startsWith("/activities")) return "activities";
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
  children,
}: {
  org: { name: string; slug: string };
  user: { name: string; email: string };
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [chrome, setChrome] = useState<Chrome>({});
  const setChromeCb = useCallback((c: Chrome) => setChrome(c), []);

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
            onSelect={(id) => ROUTES[id] && router.push(ROUTES[id])}
            header={<OrgSwitcher org={org} />}
            items={NAV}
          />
          <UserRow user={user} onSignOut={signOut} />
        </aside>

        <div className="flex min-w-0 flex-col overflow-hidden">
          <header className="flex h-[var(--topbar-height)] flex-none items-center gap-4 border-b border-edge bg-surface-card px-6">
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

          <main className="min-h-0 flex-1 overflow-y-auto p-6">
            <div className="mx-auto flex max-w-[var(--content-max)] flex-col gap-5">{children}</div>
          </main>
        </div>
      </div>
    </ChromeContext.Provider>
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
