/** German/DACH formatting helpers shared by the data components. */

/** Minor units → "12.000,00 EUR" (de-DE grouping, currency suffixed). */
export function formatMoney(
  amountCents: number | null | undefined,
  currency = "EUR",
  { decimals = true }: { decimals?: boolean } = {},
): string {
  const value = (amountCents || 0) / 100;
  return (
    value.toLocaleString("de-DE", {
      minimumFractionDigits: decimals ? 2 : 0,
      maximumFractionDigits: decimals ? 2 : 0,
    }) +
    " " +
    currency
  );
}

/** Date → "14.03.2026". */
export function formatDate(value: Date | string | number): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}
