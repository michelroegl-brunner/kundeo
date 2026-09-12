/**
 * Money maths for offer/invoice documents — pure, integer-cent, no I/O.
 *
 * The single source of truth for line and document totals, shared by the offer
 * builder (live preview), the server action (before POST) and the mapper (the
 * FreeFinance payload). FreeFinance verification-checks every line and the
 * document sum, so these numbers must match exactly what we post.
 *
 * All amounts are integer minor units (cents). Quantities and discount values
 * are decimals (numbers). Rounding is half-away-from-zero via Math.round on
 * positive magnitudes.
 */

export type DiscountMode = "RATE" | "CONSTANT";
export type LineType = "ITEM" | "TOTAL_DISCOUNT";

export interface LineInput {
  type?: LineType;
  quantity: number;
  unitPriceCents: number;
  discountValue?: number | null;
  discountMode?: DiscountMode | null;
  vatRate: number; // percent, e.g. 20
}

export interface DocDiscount {
  value: number;
  mode: DiscountMode;
}

export interface LineTotals {
  /** Net before any line discount. */
  grossNetCents: number;
  /** The line discount applied (>= 0). */
  discountCents: number;
  /** Net after the line discount. */
  netCents: number;
  taxCents: number;
  totalCents: number;
}

export interface DocumentTotals {
  /** Sum of item-line net (after per-line discounts, before document discount). */
  subtotalNetCents: number;
  /** Document-level discount applied (>= 0). */
  discountCents: number;
  netCents: number;
  taxCents: number;
  totalCents: number;
  /** Per-line net/tax/total after apportioning the document discount. */
  lines: LineTotals[];
}

const roundCents = (n: number): number => Math.round(n);

/** Net/tax/total for a single item line, applying its own discount. */
export function lineTotals(line: LineInput): LineTotals {
  const grossNetCents = roundCents(line.quantity * line.unitPriceCents);
  let discountCents = 0;
  if (line.discountValue && line.discountValue > 0) {
    discountCents =
      line.discountMode === "CONSTANT"
        ? roundCents(line.discountValue * 100)
        : roundCents((grossNetCents * line.discountValue) / 100);
  }
  discountCents = Math.min(Math.max(discountCents, 0), grossNetCents);
  const netCents = grossNetCents - discountCents;
  const taxCents = roundCents((netCents * line.vatRate) / 100);
  return { grossNetCents, discountCents, netCents, taxCents, totalCents: netCents + taxCents };
}

/**
 * Document totals. Item lines are summed, then any document-level discount is
 * apportioned across lines proportional to their net so per-VAT-rate tax stays
 * correct even with mixed rates; the rounding remainder lands on the largest
 * line. Tax is recomputed on the discounted net per line.
 */
export function documentTotals(items: LineInput[], docDiscount?: DocDiscount | null): DocumentTotals {
  const base = items.map(lineTotals);
  const subtotalNetCents = base.reduce((s, l) => s + l.netCents, 0);

  let discountCents = 0;
  if (docDiscount && docDiscount.value > 0 && subtotalNetCents > 0) {
    discountCents =
      docDiscount.mode === "CONSTANT"
        ? roundCents(docDiscount.value * 100)
        : roundCents((subtotalNetCents * docDiscount.value) / 100);
    discountCents = Math.min(discountCents, subtotalNetCents);
  }

  // Apportion the document discount across lines by net weight.
  const shares = base.map((l) =>
    subtotalNetCents > 0 ? Math.floor((discountCents * l.netCents) / subtotalNetCents) : 0,
  );
  let remainder = discountCents - shares.reduce((s, x) => s + x, 0);
  // Assign the remainder cent-by-cent to the largest-net lines.
  const order = base.map((_, i) => i).sort((a, b) => (base[b]?.netCents ?? 0) - (base[a]?.netCents ?? 0));
  for (let k = 0; remainder > 0 && k < order.length; k++, remainder--) {
    const idx = order[k] ?? 0;
    shares[idx] = (shares[idx] ?? 0) + 1;
  }

  const lines: LineTotals[] = base.map((l, i) => {
    const share = shares[i] ?? 0;
    const netCents = l.netCents - share;
    const taxCents = roundCents((netCents * (items[i]?.vatRate ?? 0)) / 100);
    return { grossNetCents: l.grossNetCents, discountCents: l.discountCents + share, netCents, taxCents, totalCents: netCents + taxCents };
  });

  const netCents = lines.reduce((s, l) => s + l.netCents, 0);
  const taxCents = lines.reduce((s, l) => s + l.taxCents, 0);
  return { subtotalNetCents, discountCents, netCents, taxCents, totalCents: netCents + taxCents, lines };
}

export interface Reconciliation {
  ok: boolean;
  net: { computed: number; provided: number };
  tax: { computed: number; provided: number };
  total: { computed: number; provided: number };
}

/** Verify a document's stored totals equal the computed line sums (cents). */
export function reconcile(
  items: LineInput[],
  provided: { netCents: number; taxCents: number; totalCents: number },
  docDiscount?: DocDiscount | null,
): Reconciliation {
  const t = documentTotals(items, docDiscount);
  return {
    ok:
      t.netCents === provided.netCents &&
      t.taxCents === provided.taxCents &&
      t.totalCents === provided.totalCents,
    net: { computed: t.netCents, provided: provided.netCents },
    tax: { computed: t.taxCents, provided: provided.taxCents },
    total: { computed: t.totalCents, provided: provided.totalCents },
  };
}

/** cents → FreeFinance decimal (2 places). */
export const centsToDecimal = (cents: number): number => Math.round(cents) / 100;

/** FreeFinance decimal → integer cents. */
export const decimalToCents = (value: number): number => Math.round(value * 100);
