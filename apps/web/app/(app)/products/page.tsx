import { ensureActiveOrgId, scoped } from "@/lib/session";
import { getFreeFinanceClient, isFreeFinanceConnected } from "@/lib/freefinance";
import { getReferenceData } from "@/lib/freefinance/refdata";
import { ProductsView, type ProductRow, type ProductPickers } from "@/components/products/products-view";
import type { Option } from "@/lib/freefinance/types";

export const dynamic = "force-dynamic";

const EMPTY_PICKERS: ProductPickers = { accounts: [], vatRates: [], units: [] };

export default async function ProductsPage() {
  const orgId = await ensureActiveOrgId();
  const connected = orgId ? await isFreeFinanceConnected(orgId).catch(() => false) : false;

  const { products, refs } = await scoped(async (db) => {
    const [products, refs] = await Promise.all([
      db.product.findMany({ orderBy: { name: "asc" } }),
      db.externalRef.findMany({ where: { provider: "freefinance", entityType: "item" } }),
    ]);
    return { products, refs };
  });

  const refByEntity = new Map(refs.map((r) => [r.entityId, r]));

  const rows: ProductRow[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku ?? "",
    unit: p.unit ?? "",
    unitPriceCents: p.unitPriceCents,
    currency: p.currency,
    vatRate: p.vatRate,
    account: p.account ?? "",
    description: p.description ?? "",
    active: p.active,
    synced: refByEntity.has(p.id),
    externalNumber: refByEntity.get(p.id)?.externalNumber ?? "",
  }));

  // Best-effort reference data for the drawer pickers (cached; may be empty).
  let pickers: ProductPickers = EMPTY_PICKERS;
  if (orgId && connected) {
    try {
      const client = await getFreeFinanceClient(orgId);
      const ref = await getReferenceData(orgId, client);
      pickers = {
        accounts: ref.accounts,
        vatRates: ref.vatRates.length ? ref.vatRates : defaultVatRates(),
        units: ref.units,
      };
    } catch {
      pickers = { ...EMPTY_PICKERS, vatRates: defaultVatRates() };
    }
  }

  return <ProductsView rows={rows} pickers={pickers} connected={connected} />;
}

function defaultVatRates(): Option[] {
  return [
    { value: "20", label: "20 %" },
    { value: "10", label: "10 %" },
    { value: "13", label: "13 %" },
    { value: "0", label: "0 %" },
  ];
}
