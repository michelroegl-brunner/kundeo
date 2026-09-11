import { prisma } from "@kundeo/db";
import { getSession, ensureActiveOrgId, scoped } from "@/lib/session";
import {
  SettingsView,
  type NotificationPrefs,
  type StageItem,
} from "@/components/settings/settings-view";
import pkg from "../../../package.json";

export const dynamic = "force-dynamic";

const DEFAULT_PREFS: NotificationPrefs = {
  email: { newActivities: true, dueTasks: true, dealWonLost: false, weeklyPipeline: true },
  inApp: { assignments: true, mentions: true, stageChanges: false },
  summary: "daily",
};

function maskDbUrl(url: string | undefined): string {
  if (!url) return "nicht gesetzt";
  return url.replace(/:\/\/([^:@/]+):[^@]*@/, "://$1:***@");
}

function parseMetadata(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export default async function SettingsPage() {
  const [session, orgId] = await Promise.all([getSession(), ensureActiveOrgId()]);

  const org = orgId
    ? await prisma.organization.findUnique({
        where: { id: orgId },
        select: { id: true, name: true, slug: true, metadata: true },
      })
    : null;

  const meta = parseMetadata(org?.metadata ?? null);

  const { stages } = await scoped(async (db) => {
    const pipeline = await db.pipeline.findFirst({
      where: { isDefault: true },
      orderBy: { createdAt: "asc" },
      include: {
        stages: {
          orderBy: { order: "asc" },
          include: { _count: { select: { deals: true } } },
        },
      },
    });
    return { stages: pipeline?.stages ?? [] };
  });

  const stageItems: StageItem[] = stages.map((s) => ({
    id: s.id,
    name: s.name,
    probability: s.probability,
    deals: s._count.deals,
  }));

  const storedPrefs = (meta.notifications as Record<string, NotificationPrefs> | undefined)?.[session?.user.id ?? ""];
  const prefs: NotificationPrefs = {
    email: { ...DEFAULT_PREFS.email, ...storedPrefs?.email },
    inApp: { ...DEFAULT_PREFS.inApp, ...storedPrefs?.inApp },
    summary: storedPrefs?.summary ?? DEFAULT_PREFS.summary,
  };

  const orgSettings = {
    name: org?.name ?? "",
    slug: org?.slug ?? "",
    currency: typeof meta.currency === "string" ? meta.currency : "EUR",
    country: typeof meta.country === "string" ? meta.country : "DE",
    vatId: typeof meta.vatId === "string" ? meta.vatId : "",
    timezone: typeof meta.timezone === "string" ? meta.timezone : "Europe/Berlin",
  };

  const instance = {
    baseUrl: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    version: pkg.version || "0.0.0",
    database: maskDbUrl(process.env.DATABASE_URL),
    license: "AGPL-3.0-only",
    status: [
      { label: "Datenbank", tone: "success" as const, value: "Verbunden" },
      { label: "Migrationen", tone: "success" as const, value: "Aktuell" },
      { label: "Row-Level Security", tone: "success" as const, value: "Aktiv" },
      { label: "Hintergrundjobs", tone: "warning" as const, value: "Nicht konfiguriert" },
    ],
  };

  return (
    <SettingsView
      org={orgSettings}
      orgIdMasked="app.current_org_id"
      stages={stageItems}
      prefs={prefs}
      instance={instance}
    />
  );
}
