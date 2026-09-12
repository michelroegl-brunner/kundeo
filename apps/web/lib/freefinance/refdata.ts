import type { FreeFinanceClient } from "./client";
import type { FfFeature, Option } from "./types";

/**
 * Cached FreeFinance reference data per organization. These change rarely, so a
 * short in-memory TTL keeps the settings UI and the offer builder responsive
 * without hammering the API. All lookups are read-only.
 */
export interface ReferenceData {
  features: FfFeature[];
  modules: { mas: boolean; itm: boolean; inv: boolean; cbi: boolean; fis: boolean };
  accounts: Option[]; // income accounts: value=id label="code name"
  /** vatRate (percent) → tax_class_entry id, derived from account default taxes. */
  vatEntries: Record<number, string>;
  vatRates: Option[]; // value=String(rate) label="20 %"
  units: Option[];
  defaults: {
    paymentTermId?: string;
    sequenceGroupId?: string;
    layoutId?: string;
  };
}

interface CacheEntry {
  at: number;
  data: ReferenceData;
}
const TTL_MS = 5 * 60_000;
const cache = new Map<string, CacheEntry>();

function moduleActive(features: FfFeature[], prefix: string): boolean {
  return features.some((f) => (f.name === prefix || f.name.startsWith(`${prefix}_`)) && f.state === "ACTIVE");
}

export async function getReferenceData(organizationId: string, client: FreeFinanceClient, force = false): Promise<ReferenceData> {
  const hit = cache.get(organizationId);
  if (!force && hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const [features, accounts, defaultTerm, defaultSeq, defaultLayout, units] = await Promise.all([
    client.getFeatures().catch(() => [] as FfFeature[]),
    client.listIncomeAccounts().catch(() => []),
    client.reference<{ id?: string }>("/inv/payment_terms/default").catch(() => ({}) as { id?: string }),
    client.reference<{ id?: string }>("/inv/document_sequence_groups/default").catch(() => ({}) as { id?: string }),
    client.reference<{ id?: string }>("/inv/layout_setups/default").catch(() => ({}) as { id?: string }),
    client.global<{ content?: { code: string; key_name?: string }[] }>("/fnd/units_of_measure").catch(() => ({ content: [] })),
  ]);

  const vatEntries: Record<number, string> = {};
  const accountOptions: Option[] = [];
  for (const a of accounts) {
    accountOptions.push({ value: a.id, label: `${a.code} · ${a.name}` });
    const tce = a.default_taxes?.tax_1?.tax_class_entry;
    if (tce?.id && typeof tce.tax_rate_value === "number" && vatEntries[tce.tax_rate_value] === undefined) {
      vatEntries[tce.tax_rate_value] = tce.id;
    }
  }

  const vatRates: Option[] = Object.keys(vatEntries)
    .map(Number)
    .sort((a, b) => a - b)
    .map((r) => ({ value: String(r), label: `${r} %` }));

  const unitList = (units.content ?? []).map((u) => ({ value: u.code, label: u.code }));

  const data: ReferenceData = {
    features,
    modules: {
      mas: moduleActive(features, "mas"),
      itm: moduleActive(features, "itm"),
      inv: moduleActive(features, "inv"),
      cbi: moduleActive(features, "cbi"),
      fis: moduleActive(features, "fis"),
    },
    accounts: accountOptions,
    vatEntries,
    vatRates,
    units: unitList,
    defaults: {
      paymentTermId: defaultTerm?.id,
      sequenceGroupId: defaultSeq?.id,
      layoutId: defaultLayout?.id,
    },
  };
  cache.set(organizationId, { at: Date.now(), data });
  return data;
}

export function invalidateReferenceData(organizationId: string): void {
  cache.delete(organizationId);
}

/** Resolve a VAT rate to a tax_class_entry id, or the nearest available. */
export function taxEntryFor(ref: ReferenceData, vatRate: number): string | undefined {
  if (ref.vatEntries[vatRate]) return ref.vatEntries[vatRate];
  // Fall back to the closest configured rate.
  const rates = Object.keys(ref.vatEntries).map(Number);
  if (!rates.length) return undefined;
  const nearest = rates.reduce((a, b) => (Math.abs(b - vatRate) < Math.abs(a - vatRate) ? b : a));
  return ref.vatEntries[nearest];
}
