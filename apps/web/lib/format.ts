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

const WEEKDAY_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/**
 * Human run timestamp: "Heute, 09:14", "Gestern, 17:42", "Mo, 08:00" within a
 * week, else "04.03.2026, 08:00". 24h, de-DE.
 */
export function formatRunTime(value: Date | string | number): string {
  const d = value instanceof Date ? value : new Date(value);
  const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);
  if (days === 0) return `Heute, ${time}`;
  if (days === 1) return `Gestern, ${time}`;
  if (days > 1 && days < 7) return `${WEEKDAY_SHORT[d.getDay()]}, ${time}`;
  return `${formatDate(d)}, ${time}`;
}
