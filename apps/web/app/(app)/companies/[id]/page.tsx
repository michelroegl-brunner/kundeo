import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { scoped } from "@/lib/session";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { formatMoney, formatDate } from "@/lib/format";
import {
  CompanyPanels,
  type CompanyActivity,
  type CompanyContactRow,
  type CompanyDeal,
} from "@/components/companies/company-panels";

export const dynamic = "force-dynamic";

const COUNTRY_LABEL: Record<string, string> = { DE: "Deutschland", AT: "Österreich", CH: "Schweiz" };

function fmtDateTime(value: Date): string {
  return value.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Line({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[112px_1fr] gap-3 border-b border-edge-subtle py-[7px] last:border-b-0">
      <span className="font-sans text-xs text-content-muted">{label}</span>
      <span className={mono ? "font-mono text-xs tabular-nums text-content" : "font-sans text-xs text-content"}>
        {value || "—"}
      </span>
    </div>
  );
}

function ActionLink({ href, icon, children, variant = "primary" }: { href: string; icon: string; children: ReactNode; variant?: "primary" | "secondary" }) {
  const base =
    "inline-flex h-[var(--control-height-sm)] items-center gap-1.5 rounded-md px-[10px] font-sans text-xs font-medium tracking-snug transition duration-[120ms] ease-out focus-visible:outline-none focus-visible:[box-shadow:var(--ring-brand)]";
  const look =
    variant === "primary"
      ? "bg-brand text-on-brand shadow-xs hover:bg-brand-hover"
      : "border border-edge bg-surface-card text-content shadow-xs hover:bg-surface-hover hover:border-edge-strong";
  return (
    <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noreferrer" : undefined} className={`${base} ${look}`}>
      <Icon name={icon} size={14} />
      {children}
    </a>
  );
}

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const data = await scoped(async (db) => {
    const company = await db.company.findFirst({ where: { id } });
    if (!company) return null;

    const [contacts, deals, members] = await Promise.all([
      db.contact.findMany({ where: { companyId: id }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
      db.deal.findMany({
        where: { companyId: id },
        include: { company: { select: { name: true } }, stage: { select: { name: true } } },
        orderBy: { updatedAt: "desc" },
      }),
      db.member.findMany({ include: { user: { select: { id: true, name: true } } } }),
    ]);

    const contactIds = contacts.map((c) => c.id);
    const dealIds = deals.map((d) => d.id);
    const activities =
      contactIds.length || dealIds.length
        ? await db.activity.findMany({
            where: { OR: [{ contactId: { in: contactIds } }, { dealId: { in: dealIds } }] },
            orderBy: { createdAt: "desc" },
            take: 20,
          })
        : [];

    return { company, contacts, deals, members, activities };
  });

  if (!data) notFound();
  const { company, contacts, deals, members, activities } = data;

  const nameById = new Map(members.map((m) => [m.user.id, m.user.name]));
  const now = Date.now();

  const openDeals = deals.filter((d) => d.status === "OPEN");
  const volumeCents = openDeals.reduce((a, d) => a + d.amountCents, 0);

  const subtitleParts = [
    company.industry,
    company.city ? `${[company.postalCode, company.city].filter(Boolean).join(" ")} (${company.country})` : null,
  ].filter(Boolean);

  const panelContacts: CompanyContactRow[] = contacts.map((c) => ({
    id: c.id,
    title: c.title,
    firstName: c.firstName,
    lastName: c.lastName,
    position: c.position ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
  }));

  const panelDeals: CompanyDeal[] = deals.map((d) => ({
    id: d.id,
    title: d.title,
    company: d.company?.name ?? company.name,
    amountCents: d.amountCents,
    currency: d.currency === "CHF" ? "CHF" : "EUR",
    owner: (d.ownerId && nameById.get(d.ownerId)) || undefined,
    dueLabel: d.expectedCloseAt ? formatDate(d.expectedCloseAt) : undefined,
    overdue: d.expectedCloseAt ? d.expectedCloseAt.getTime() < now : false,
  }));

  const panelActivities: CompanyActivity[] = activities.map((a) => ({
    id: a.id,
    type: a.type as CompanyActivity["type"],
    subject: a.subject,
    body: a.body ?? undefined,
    author: (a.authorId && nameById.get(a.authorId)) || undefined,
    timestamp: fmtDateTime(a.createdAt),
  }));

  const websiteHref = company.website
    ? company.website.startsWith("http")
      ? company.website
      : `https://${company.website}`
    : company.domain
      ? `https://${company.domain}`
      : null;

  return (
    <>
      <Card>
        <div className="flex items-start gap-4">
          <Avatar name={company.name} size="xl" tone="neutral" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-sans text-xl font-semibold tracking-tight text-content">{company.name}</h2>
              <Badge tone="brand">{openDeals.length} offene Deals</Badge>
            </div>
            {subtitleParts.length || company.domain ? (
              <p className="mt-1 font-sans text-sm text-content-secondary">
                {subtitleParts.join(" · ")}
                {company.domain ? (
                  <>
                    {subtitleParts.length ? " · " : null}
                    <span className="font-mono text-xs">{company.domain}</span>
                  </>
                ) : null}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {company.phone ? (
                <ActionLink href={`tel:${company.phone}`} icon="phone">
                  Anrufen
                </ActionLink>
              ) : null}
              {websiteHref ? (
                <ActionLink href={websiteHref} icon="external-link" variant="secondary">
                  Website
                </ActionLink>
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-[minmax(0,1fr)_320px] items-start gap-4 max-lg:grid-cols-1">
        <CompanyPanels
          contacts={panelContacts}
          deals={panelDeals}
          activities={panelActivities}
          master={{
            name: company.name,
            industry: company.industry ?? "",
            vatId: company.vatId ?? "",
            domain: company.domain ?? "",
            street: company.street ?? "",
            postalCode: company.postalCode ?? "",
            city: company.city ?? "",
            country: company.country,
            phone: company.phone ?? "",
          }}
        />

        <div className="flex flex-col gap-4">
          <Card title="Kennzahlen">
            <Line label="Offene Deals" value={String(openDeals.length)} mono />
            <Line label="Volumen" value={formatMoney(volumeCents, "EUR")} mono />
            <Line label="Kontakte" value={String(contacts.length)} mono />
          </Card>

          <Card title="Anschrift">
            <Line label="Straße" value={company.street} />
            <Line
              label="PLZ / Ort"
              value={[company.postalCode, company.city].filter(Boolean).join(" ")}
              mono
            />
            <Line label="Land" value={COUNTRY_LABEL[company.country] ?? company.country} />
            <Line label="Telefon" value={company.phone} mono />
          </Card>
        </div>
      </div>
    </>
  );
}
