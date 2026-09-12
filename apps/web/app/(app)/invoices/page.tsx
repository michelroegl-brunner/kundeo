import { scoped } from "@/lib/session";
import { InvoicesView, type InvoiceRow, type InvoiceKpis, type ConvertibleOffer } from "@/components/invoices/invoices-view";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const { invoices, offers, companies } = await scoped(async (db) => {
    const [invoices, offers] = await Promise.all([
      db.document.findMany({ where: { kind: "INVOICE" }, orderBy: { createdAt: "desc" } }),
      db.document.findMany({ where: { kind: "OFFER", status: "FINALIZED" }, orderBy: { createdAt: "desc" } }),
    ]);
    const ids = [...new Set([...invoices, ...offers].map((d) => d.companyId).filter((x): x is string => !!x))];
    const companies = ids.length ? await db.company.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
    return { invoices, offers, companies };
  });

  const name = new Map(companies.map((c) => [c.id, c.name]));
  const now = Date.now();
  const in30 = now - 30 * 86_400_000;

  const rows: InvoiceRow[] = invoices.map((d) => ({
    id: d.id,
    number: d.externalNumber ?? "",
    customer: d.companyId ? name.get(d.companyId) ?? "—" : "—",
    date: d.issueDate ? d.issueDate.toISOString() : "",
    dueDate: d.dueDate ? d.dueDate.toISOString() : "",
    totalCents: d.totalCents,
    currency: d.currency,
    status: d.status,
    paymentStatus: d.paymentStatus,
    overdue: Boolean(d.status === "FINALIZED" && d.paymentStatus !== "PAID" && d.dueDate && d.dueDate.getTime() < now),
  }));

  const kpis: InvoiceKpis = {
    openCents: invoices.filter((d) => d.status === "FINALIZED" && d.paymentStatus !== "PAID").reduce((s, d) => s + (d.totalCents - d.paidCents), 0),
    overdueCents: invoices.filter((d) => d.status === "FINALIZED" && d.paymentStatus !== "PAID" && d.dueDate && d.dueDate.getTime() < now).reduce((s, d) => s + (d.totalCents - d.paidCents), 0),
    paid30Cents: invoices.filter((d) => d.paymentStatus === "PAID" && d.issueDate && d.issueDate.getTime() >= in30).reduce((s, d) => s + d.totalCents, 0),
    drafts: invoices.filter((d) => d.status === "DRAFT").length,
  };

  const convertible: ConvertibleOffer[] = offers.map((o) => ({
    id: o.id,
    number: o.externalNumber ?? "",
    customer: o.companyId ? name.get(o.companyId) ?? "—" : "—",
    totalCents: o.totalCents,
    currency: o.currency,
  }));

  return <InvoicesView rows={rows} kpis={kpis} convertible={convertible} />;
}
