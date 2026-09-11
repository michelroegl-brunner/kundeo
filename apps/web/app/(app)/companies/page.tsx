import { scoped } from "@/lib/session";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CompaniesList, type CompanyRow } from "@/components/companies/companies-list";

export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  const { companies, openDeals } = await scoped(async (db) => {
    const [companies, openDeals] = await Promise.all([
      db.company.findMany({
        include: { _count: { select: { contacts: true } } },
        orderBy: { name: "asc" },
      }),
      db.deal.findMany({ where: { status: "OPEN" }, select: { companyId: true, amountCents: true } }),
    ]);
    return { companies, openDeals };
  });

  if (companies.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="building-2"
          title="Noch keine Firmen"
          description="Sobald Firmen angelegt sind, erscheinen sie hier als durchsuchbare Liste."
        />
      </Card>
    );
  }

  // Aggregate open-deal count and volume per company in one pass.
  const agg = new Map<string, { count: number; cents: number }>();
  for (const d of openDeals) {
    if (!d.companyId) continue;
    const cur = agg.get(d.companyId) ?? { count: 0, cents: 0 };
    cur.count += 1;
    cur.cents += d.amountCents;
    agg.set(d.companyId, cur);
  }

  const rows: CompanyRow[] = companies.map((c) => {
    const a = agg.get(c.id) ?? { count: 0, cents: 0 };
    return {
      id: c.id,
      name: c.name,
      domain: c.domain ?? "",
      industry: c.industry ?? "",
      city: c.city ?? "",
      postalCode: c.postalCode ?? "",
      country: c.country,
      vatId: c.vatId ?? "",
      contactCount: c._count.contacts,
      openDeals: a.count,
      volumeCents: a.cents,
    };
  });

  return <CompaniesList rows={rows} />;
}
