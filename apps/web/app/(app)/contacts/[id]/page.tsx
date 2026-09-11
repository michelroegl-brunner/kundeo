import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { scoped } from "@/lib/session";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Tag } from "@/components/ui/tag";
import { Icon } from "@/components/ui/icon";
import { formatDate } from "@/lib/format";
import {
  ContactPanels,
  type PanelActivity,
  type PanelDeal,
} from "@/components/contacts/contact-panels";
import type { ActivityKind } from "./actions";

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

/** Read-only labelled row for the right-column cards. */
function Row({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[108px_1fr] gap-3 border-b border-edge-subtle py-[7px] last:border-b-0">
      <span className="font-sans text-xs text-content-muted">{label}</span>
      <span className={mono ? "font-mono text-xs tabular-nums text-content" : "font-sans text-xs text-content"}>
        {value || "—"}
      </span>
    </div>
  );
}

/** Anchor styled as a Button (real tel:/mailto: links — Button renders a <button>). */
function ActionLink({ href, icon, children, variant = "primary" }: { href: string; icon: string; children: ReactNode; variant?: "primary" | "secondary" }) {
  const base =
    "inline-flex h-[var(--control-height-sm)] items-center gap-1.5 rounded-md px-[10px] font-sans text-xs font-medium tracking-snug transition duration-[120ms] ease-out focus-visible:outline-none focus-visible:[box-shadow:var(--ring-brand)]";
  const look =
    variant === "primary"
      ? "bg-brand text-on-brand shadow-xs hover:bg-brand-hover"
      : "border border-edge bg-surface-card text-content shadow-xs hover:bg-surface-hover hover:border-edge-strong";
  return (
    <a href={href} className={`${base} ${look}`}>
      <Icon name={icon} size={14} />
      {children}
    </a>
  );
}

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const data = await scoped(async (db) => {
    const contact = await db.contact.findFirst({
      where: { id },
      include: {
        company: { select: { id: true, name: true, city: true, country: true, vatId: true } },
        tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
      },
    });
    if (!contact) return null;

    const [deals, activities, members] = await Promise.all([
      db.deal.findMany({
        where: { contactId: id },
        include: { company: { select: { name: true } }, stage: { select: { name: true } } },
        orderBy: { updatedAt: "desc" },
      }),
      db.activity.findMany({ where: { contactId: id }, orderBy: { createdAt: "desc" } }),
      db.member.findMany({ include: { user: { select: { id: true, name: true } } } }),
    ]);
    return { contact, deals, activities, members };
  });

  if (!data) notFound();
  const { contact, deals, activities, members } = data;

  const nameById = new Map(members.map((m) => [m.user.id, m.user.name]));
  const ownerName = (contact.ownerId && nameById.get(contact.ownerId)) || "";
  const fullName = [contact.salutation, contact.title, contact.firstName, contact.lastName]
    .filter(Boolean)
    .join(" ");
  const company = contact.company;
  const now = Date.now();

  const subtitleParts = [
    contact.position,
    company?.name,
    company?.city ? `${company.city} (${company.country})` : null,
  ].filter(Boolean);

  const panelActivities: PanelActivity[] = activities.map((a) => ({
    id: a.id,
    type: a.type as ActivityKind,
    subject: a.subject,
    body: a.body ?? undefined,
    author: (a.authorId && nameById.get(a.authorId)) || undefined,
    timestamp: fmtDateTime(a.createdAt),
  }));

  const panelDeals: PanelDeal[] = deals.map((d) => ({
    id: d.id,
    title: d.title,
    company: d.company?.name ?? "",
    amountCents: d.amountCents,
    currency: d.currency === "CHF" ? "CHF" : "EUR",
    owner: (d.ownerId && nameById.get(d.ownerId)) || undefined,
    dueLabel: d.expectedCloseAt ? formatDate(d.expectedCloseAt) : undefined,
    overdue: d.expectedCloseAt ? d.expectedCloseAt.getTime() < now : false,
  }));

  return (
    <>
      <Card>
        <div className="flex items-start gap-4">
          <Avatar name={`${contact.firstName} ${contact.lastName}`} size="xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-sans text-xl font-semibold tracking-tight text-content">{fullName}</h2>
              {contact.tags.map((t) => (
                <Tag key={t.tag.id} color={t.tag.color}>
                  {t.tag.name}
                </Tag>
              ))}
            </div>
            {subtitleParts.length ? (
              <p className="mt-1 font-sans text-sm text-content-secondary">{subtitleParts.join(" · ")}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {contact.phone ? (
                <ActionLink href={`tel:${contact.phone}`} icon="phone">
                  Anrufen
                </ActionLink>
              ) : null}
              {contact.email ? (
                <ActionLink href={`mailto:${contact.email}`} icon="mail" variant="secondary">
                  E-Mail
                </ActionLink>
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-[minmax(0,1fr)_320px] items-start gap-4 max-lg:grid-cols-1">
        <ContactPanels
          contactId={contact.id}
          activities={panelActivities}
          deals={panelDeals}
          master={{
            salutation: contact.salutation ?? "",
            title: contact.title ?? "",
            firstName: contact.firstName,
            lastName: contact.lastName,
            email: contact.email ?? "",
            phone: contact.phone ?? "",
            position: contact.position ?? "",
          }}
        />

        <div className="flex flex-col gap-4">
          <Card title="Kontaktdaten">
            <Row label="E-Mail" value={contact.email} mono />
            <Row label="Telefon" value={contact.phone} mono />
            <Row label="Position" value={contact.position} />
            <Row label="Inhaber" value={ownerName} />
          </Card>

          {company ? (
            <Card
              title={company.name}
              subtitle="Firma"
              actions={
                <Link
                  href={`/companies/${company.id}`}
                  aria-label="Firma öffnen"
                  title="Firma öffnen"
                  className="grid h-[26px] w-[26px] place-items-center rounded-md text-content-secondary transition duration-[120ms] ease-out hover:bg-surface-active focus-visible:outline-none focus-visible:[box-shadow:var(--ring-brand)]"
                >
                  <Icon name="external-link" size={14} />
                </Link>
              }
            >
              <Row label="Ort" value={company.city ? `${company.city} (${company.country})` : ""} />
              <Row label="Land" value={COUNTRY_LABEL[company.country] ?? company.country} />
              <Row label="USt-IdNr." value={company.vatId} mono />
              <Row label="Offene Deals" value={String(panelDeals.length)} mono />
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
