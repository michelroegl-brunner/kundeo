import { prisma } from "@kundeo/db";
import { getSession, ensureActiveOrgId, scoped } from "@/lib/session";
import {
  SettingsView,
  type NotificationPrefs,
  type PipelineItem,
} from "@/components/settings/settings-view";
import { loadEmailTemplateItems } from "@/lib/email/template-usage";
import { resolveEmailProvider } from "@/lib/email";
import { resolveFreeFinanceConfigPublic } from "@/lib/freefinance/config";
import type { FreeFinanceDefaults } from "@/app/(app)/settings/freefinance-actions";
import type { PreviewRecord } from "@/components/settings/email-templates/types";
import { formatDate, formatMoney } from "@/lib/format";
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

  const { pipelines, templateItems, contacts, dunningPolicy, dunningTemplates } = await scoped(async (db) => {
    const pipelines = await db.pipeline.findMany({
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      include: {
        stages: {
          orderBy: { order: "asc" },
          include: { _count: { select: { deals: true } } },
        },
      },
    });
    const templateItems = await loadEmailTemplateItems(db);
    const contacts = await db.contact.findMany({
      where: { email: { not: null } },
      orderBy: { updatedAt: "desc" },
      take: 12,
      include: { company: true, deals: { orderBy: { updatedAt: "desc" }, take: 1, include: { stage: true } } },
    });
    const dunningPolicy = await db.dunningPolicy.findFirst({ include: { levels: { orderBy: { level: "asc" } } } });
    const dunningTemplates = await db.emailTemplate.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
    return { pipelines, templateItems, contacts, dunningPolicy, dunningTemplates };
  });

  const pipelineItems: PipelineItem[] = pipelines.map((p) => ({
    id: p.id,
    name: p.name,
    isDefault: p.isDefault,
    stages: p.stages.map((s) => ({
      id: s.id,
      name: s.name,
      probability: s.probability,
      deals: s._count.deals,
    })),
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

  const orgName = org?.name ?? "";
  const userName = session?.user.name ?? "";
  const previewRecords: PreviewRecord[] = contacts.map((c) => {
    const deal = c.deals[0];
    const label =
      [c.salutation, c.title, c.firstName, c.lastName].filter(Boolean).join(" ") +
      (c.company ? ` · ${c.company.name}` : "");
    return {
      id: c.id,
      label,
      values: {
        "contact.salutation": c.salutation ?? "",
        "contact.firstName": c.firstName,
        "contact.lastName": c.lastName,
        "contact.email": c.email ?? "",
        "company.name": c.company?.name ?? "",
        "company.city": c.company?.city ?? "",
        "company.vatId": c.company?.vatId ?? "",
        "deal.title": deal?.title ?? "",
        "deal.amount": deal ? formatMoney(deal.amountCents, deal.currency) : "",
        "deal.stage": deal?.stage?.name ?? "",
        "deal.closeDate": deal?.expectedCloseAt ? formatDate(deal.expectedCloseAt) : "",
        "deal.owner": "",
        today: formatDate(new Date()),
        "org.name": orgName,
        "user.name": userName,
      },
    };
  });

  const templateCategories = [...new Set(templateItems.map((t) => t.category).filter((c): c is string => !!c))].sort(
    (a, b) => a.localeCompare(b, "de"),
  );

  const freeFinanceConfig = orgId
    ? await resolveFreeFinanceConfigPublic(orgId)
    : { baseUrl: "", clientId: "", mandant: "", hasSecret: false, source: null };
  const storedFf = (meta.freefinance as Partial<FreeFinanceDefaults> | undefined) ?? {};
  const freeFinanceDefaults: FreeFinanceDefaults = {
    account: typeof storedFf.account === "string" ? storedFf.account : "",
    vatRate: typeof storedFf.vatRate === "number" ? storedFf.vatRate : 20,
    unit: typeof storedFf.unit === "string" ? storedFf.unit : "STK",
    eInvoice: typeof storedFf.eInvoice === "string" ? storedFf.eInvoice : "NONE",
  };

  const dunningPolicyView = {
    isActive: dunningPolicy?.isActive ?? true,
    graceDays: dunningPolicy?.graceDays ?? 3,
    intervalDays: dunningPolicy?.intervalDays ?? 7,
    levels: dunningPolicy?.levels.length
      ? dunningPolicy.levels.map((l) => ({ level: l.level, label: l.label, feeCents: l.feeCents, interestBps: l.interestBps, emailTemplateId: l.emailTemplateId }))
      : [
          { level: 1, label: "Zahlungserinnerung", feeCents: 0, interestBps: 0, emailTemplateId: null },
          { level: 2, label: "1. Mahnung", feeCents: 500, interestBps: 920, emailTemplateId: null },
          { level: 3, label: "2. Mahnung", feeCents: 1000, interestBps: 920, emailTemplateId: null },
        ],
  };

  return (
    <SettingsView
      org={orgSettings}
      orgIdMasked="app.current_org_id"
      pipelines={pipelineItems}
      prefs={prefs}
      instance={instance}
      templates={templateItems}
      templateCategories={templateCategories}
      emailProvider={resolveEmailProvider()}
      previewRecords={previewRecords}
      freeFinance={{ config: freeFinanceConfig, defaults: freeFinanceDefaults }}
      dunning={{ policy: dunningPolicyView, templates: dunningTemplates }}
    />
  );
}
