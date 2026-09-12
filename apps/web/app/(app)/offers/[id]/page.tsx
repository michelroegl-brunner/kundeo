import { notFound } from "next/navigation";
import { ensureActiveOrgId, scoped } from "@/lib/session";
import { prisma } from "@kundeo/db";
import { getFreeFinanceClient } from "@/lib/freefinance";
import { getReferenceData } from "@/lib/freefinance/refdata";
import { OfferBuilder } from "@/components/offers/offer-builder";
import { DocumentDetail } from "@/components/documents/document-detail";
import { loadDocumentDetail } from "@/lib/freefinance/detail";
import type { Option } from "@/lib/freefinance/types";
import type { BuilderProduct } from "@/components/offers/offer-builder";

export const dynamic = "force-dynamic";

interface Meta {
  freefinance?: { account?: string; vatRate?: number; unit?: string; eInvoice?: string };
}

export default async function OfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isNew = id === "new";
  const orgId = await ensureActiveOrgId();

  const { companies, products, document } = await scoped(async (db) => {
    const [companies, products, document] = await Promise.all([
      db.company.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      db.product.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
      isNew ? Promise.resolve(null) : db.document.findUnique({ where: { id }, include: { lines: { orderBy: { position: "asc" } } } }),
    ]);
    return { companies, products, document };
  });

  if (!isNew && !document) notFound();

  // Finalized/cancelled → read-only detail page.
  if (document && (document.status === "FINALIZED" || document.status === "CANCELLED")) {
    const detail = await loadDocumentDetail(orgId!, document.id);
    return <DocumentDetail {...detail} />;
  }

  // Org defaults + best-effort reference data for line overrides.
  const org = orgId ? await prisma.organization.findUnique({ where: { id: orgId }, select: { metadata: true } }) : null;
  let meta: Meta = {};
  try {
    meta = org?.metadata ? (JSON.parse(org.metadata) as Meta) : {};
  } catch {
    meta = {};
  }
  const defaults = {
    account: meta.freefinance?.account ?? "",
    vatRate: meta.freefinance?.vatRate ?? 20,
    unit: meta.freefinance?.unit ?? "STK",
    eInvoice: meta.freefinance?.eInvoice ?? "NONE",
  };

  let accounts: Option[] = [];
  let vatRates: Option[] = [{ value: "20", label: "20 %" }, { value: "10", label: "10 %" }, { value: "0", label: "0 %" }];
  let invoicing = true;
  if (orgId) {
    try {
      const client = await getFreeFinanceClient(orgId);
      const ref = await getReferenceData(orgId, client);
      accounts = ref.accounts;
      if (ref.vatRates.length) vatRates = ref.vatRates;
      invoicing = ref.modules.inv;
    } catch {
      /* keep fallbacks */
    }
  }

  const builderProducts: BuilderProduct[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku ?? "",
    unit: p.unit ?? "",
    unitPriceCents: p.unitPriceCents,
    vatRate: p.vatRate,
    account: p.account ?? "",
  }));

  const initial = document
    ? {
        id: document.id,
        companyId: document.companyId ?? "",
        contactId: document.contactId ?? "",
        dealId: document.dealId ?? "",
        currency: document.currency,
        issueDate: (document.issueDate ?? new Date()).toISOString().slice(0, 10),
        expirationDate: document.expirationDate ? document.expirationDate.toISOString().slice(0, 10) : "",
        docDiscountValue: document.discountValue != null ? Number(document.discountValue) : null,
        docDiscountMode: (document.discountMode as "RATE" | "CONSTANT" | null) ?? null,
        lines: document.lines.map((l) => ({
          productId: l.productId ?? undefined,
          type: l.type as "ITEM" | "TOTAL_DISCOUNT",
          name: l.name,
          itemNumber: l.itemNumber ?? "",
          quantity: Number(l.quantity),
          unit: l.unit ?? "",
          unitPriceCents: l.unitPriceCents,
          discountValue: l.discountValue != null ? Number(l.discountValue) : null,
          discountMode: (l.discountMode as "RATE" | "CONSTANT" | null) ?? null,
          account: l.account ?? "",
          vatRate: l.vatRate,
        })),
      }
    : null;

  return (
    <OfferBuilder
      kind="OFFER"
      initial={initial}
      companies={companies}
      products={builderProducts}
      accounts={accounts}
      vatRates={vatRates}
      defaults={defaults}
      invoicing={invoicing}
    />
  );
}
