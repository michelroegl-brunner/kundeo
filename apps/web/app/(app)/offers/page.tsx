import { scoped } from "@/lib/session";
import { OffersList, type OfferRow } from "@/components/offers/offers-list";
import { OffersHeader } from "@/components/offers/offers-header";

export const dynamic = "force-dynamic";

export default async function OffersPage() {
  const { documents, companies } = await scoped(async (db) => {
    const documents = await db.document.findMany({ where: { kind: "OFFER" }, orderBy: { createdAt: "desc" } });
    const companyIds = [...new Set(documents.map((d) => d.companyId).filter((x): x is string => !!x))];
    const companies = companyIds.length
      ? await db.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true } })
      : [];
    return { documents, companies };
  });

  const companyName = new Map(companies.map((c) => [c.id, c.name]));

  const rows: OfferRow[] = documents.map((d) => ({
    id: d.id,
    number: d.externalNumber ?? "",
    customer: d.companyId ? companyName.get(d.companyId) ?? "—" : "—",
    date: d.issueDate ? d.issueDate.toISOString() : "",
    expirationDate: d.expirationDate ? d.expirationDate.toISOString() : "",
    totalCents: d.totalCents,
    currency: d.currency,
    status: d.status,
  }));

  return (
    <>
      <OffersHeader />
      <OffersList rows={rows} />
    </>
  );
}
