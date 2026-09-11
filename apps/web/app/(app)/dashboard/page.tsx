import Link from "next/link";
import type { ReactNode } from "react";
import { getSession, scoped } from "@/lib/session";
import { Card } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { ActivityItem } from "@/components/ui/activity-item";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { DashboardDealsTable, type DashboardDealRow } from "@/components/dashboard/deals-table";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Ghost-button-styled link for card header actions (Button renders a <button>,
 * which cannot wrap an anchor). */
function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-[var(--control-height-sm)] items-center gap-1.5 rounded-md px-[10px] font-sans text-xs font-medium tracking-snug text-content-secondary transition duration-[120ms] ease-out hover:bg-surface-active focus-visible:outline-none focus-visible:[box-shadow:var(--ring-brand)]"
    >
      {children}
    </Link>
  );
}

/** Cents → "12.000" (de-DE grouping, no decimals) for KPI tiles. */
function fmtInt(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { maximumFractionDigits: 0 });
}

function fmtDateTime(value: Date): string {
  return value.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type ActivityType = "NOTE" | "CALL" | "EMAIL" | "MEETING" | "TASK";

export default async function DashboardPage() {
  const session = await getSession();
  const userId = session?.user.id;

  // Start / end (exclusive) of the current ISO week, for "Aufgaben fällig".
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

  const data = await scoped(async (db, orgId) => {
    const [openDeals, pipeline, members, recentActivities, myTasks, tasksDueThisWeek] =
      await Promise.all([
        db.deal.findMany({
          where: { status: "OPEN" },
          include: { stage: true, company: { select: { name: true } } },
          orderBy: { updatedAt: "desc" },
        }),
        db.pipeline.findFirst({ where: { isDefault: true }, orderBy: { createdAt: "asc" } }),
        db.member.findMany({
          where: { organizationId: orgId },
          include: { user: { select: { id: true, name: true } } },
        }),
        db.activity.findMany({
          orderBy: { createdAt: "desc" },
          take: 5,
        }),
        db.activity.findMany({
          where: { type: "TASK", completedAt: null, dueAt: { not: null }, authorId: userId },
          orderBy: { dueAt: "asc" },
          take: 4,
        }),
        db.activity.count({
          where: { type: "TASK", completedAt: null, dueAt: { lt: endOfWeek } },
        }),
      ]);
    return { openDeals, pipeline, members, recentActivities, myTasks, tasksDueThisWeek };
  });

  const nameById = new Map(data.members.map((m) => [m.user.id, m.user.name]));

  const sumOpen = data.openDeals.reduce((a, d) => a + d.amountCents, 0);
  const weighted = data.openDeals.reduce(
    (a, d) => a + (d.amountCents * (d.stage?.probability ?? 0)) / 100,
    0,
  );

  const dealRows: DashboardDealRow[] = data.openDeals.slice(0, 6).map((d) => ({
    id: d.id,
    title: d.title,
    company: d.company?.name ?? "",
    stage: d.stage?.name ?? "",
    ownerName: (d.ownerId && nameById.get(d.ownerId)) || "",
    amountCents: d.amountCents,
    currency: d.currency,
  }));

  return (
    <>
      <div className="grid grid-cols-4 gap-4 max-md:grid-cols-2">
        <StatTile label="Pipeline offen" value={fmtInt(sumOpen)} unit="EUR" icon="target" tone="brand" />
        <StatTile label="Gewichteter Forecast" value={fmtInt(weighted)} unit="EUR" icon="trending-up" tone="success" />
        <StatTile label="Offene Deals" value={String(data.openDeals.length)} unit="Deals" icon="kanban" />
        <StatTile
          label="Aufgaben fällig"
          value={String(data.tasksDueThisWeek)}
          unit="diese Woche"
          icon="list-checks"
          tone="warning"
        />
      </div>

      <div className="grid grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] items-start gap-4 max-lg:grid-cols-1">
        <Card
          padding="none"
          title="Deals nach Phase"
          subtitle={data.pipeline ? `Pipeline „${data.pipeline.name}“` : "Pipeline"}
          actions={
            <CardLink href="/deals">
              Pipeline öffnen
              <Icon name="chevron-right" size={14} />
            </CardLink>
          }
        >
          <DashboardDealsTable rows={dealRows} />
        </Card>

        <div className="flex flex-col gap-4">
          <Card
            title="Letzte Aktivitäten"
            actions={<CardLink href="/activities">Alle</CardLink>}
          >
            {data.recentActivities.length ? (
              data.recentActivities.map((a, i) => (
                <ActivityItem
                  key={a.id}
                  type={a.type as ActivityType}
                  subject={a.subject}
                  body={a.body ?? undefined}
                  author={(a.authorId && nameById.get(a.authorId)) || undefined}
                  timestamp={fmtDateTime(a.createdAt)}
                  last={i === data.recentActivities.length - 1}
                />
              ))
            ) : (
              <EmptyState
                icon="activity"
                title="Noch keine Aktivitäten"
                description="Anrufe, E-Mails und Notizen erscheinen hier, sobald sie erfasst sind."
                compact
              />
            )}
          </Card>

          <Card title="Meine Aufgaben" subtitle="Offen und fällig">
            {data.myTasks.length ? (
              data.myTasks.map((t, i) => (
                <ActivityItem
                  key={t.id}
                  type="TASK"
                  subject={t.subject}
                  timestamp={t.dueAt ? `Fällig ${formatDate(t.dueAt)}` : undefined}
                  last={i === data.myTasks.length - 1}
                />
              ))
            ) : (
              <EmptyState
                icon="list-checks"
                title="Keine offenen Aufgaben"
                description="Aufgaben mit Fälligkeitsdatum erscheinen hier."
                compact
              />
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
