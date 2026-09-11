/**
 * Deal value model — shared by the manual deal forms, the automation
 * `field.set` / `record.create` executors, and anything that needs to derive a
 * deal's effective € value.
 *
 * A deal is priced in one of two modes:
 *  - FIXED  — the user enters `amountCents` directly.
 *  - EFFORT — the value is derived from `hoursPerWeek * hourlyRateCents`, scaled
 *             to a period (weekly / monthly / annual). Typical for retainers.
 *
 * `Deal.amountCents` always stores the *effective* value, materialised on write,
 * so every reader (pipeline sums, weighted forecast, company volume, deal cards,
 * automation conditions on "Deal-Betrag") keeps reading a single column and needs
 * no awareness of the mode.
 */

export type DealValueMode = "FIXED" | "EFFORT";
export type EffortPeriod = "WEEKLY" | "MONTHLY" | "ANNUAL";

/**
 * German money string ("10.000", "1.234,56", "90 €") → integer minor units.
 * Client-safe (no server-only deps) so both the deal form preview and the
 * server action share one parser. Returns null when nothing parseable is given.
 */
export function parseMoneyToCents(value: string | null | undefined): number | null {
  if (!value) return null;
  const normalised = value.replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(normalised);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Weeks per period. Monthly = 52/12 so a full year of weekly effort adds up. */
export const PERIOD_WEEKS: Record<EffortPeriod, number> = {
  WEEKLY: 1,
  MONTHLY: 52 / 12,
  ANNUAL: 52,
};

export const PERIOD_LABEL: Record<EffortPeriod, string> = {
  WEEKLY: "pro Woche",
  MONTHLY: "pro Monat",
  ANNUAL: "pro Jahr",
};

export type EffortInput = {
  hoursPerWeek: number | null | undefined;
  hourlyRateCents: number | null | undefined;
  effortPeriod: EffortPeriod | null | undefined;
};

/**
 * Effective effort value in minor units (cents), rounded. Returns 0 when the
 * effort inputs are incomplete so a half-filled form never produces NaN.
 */
export function effortAmountCents({
  hoursPerWeek,
  hourlyRateCents,
  effortPeriod,
}: EffortInput): number {
  const hours = Number(hoursPerWeek);
  const rate = Number(hourlyRateCents);
  if (!Number.isFinite(hours) || !Number.isFinite(rate)) return 0;
  const weeks = PERIOD_WEEKS[effortPeriod ?? "MONTHLY"];
  return Math.round(hours * rate * weeks);
}

export type DealValueInput = {
  valueMode: DealValueMode;
  amountCents?: number | null;
  hoursPerWeek?: number | null;
  hourlyRateCents?: number | null;
  effortPeriod?: EffortPeriod | null;
};

/**
 * The value to persist in `Deal.amountCents`. In EFFORT mode it is derived from
 * the effort inputs; in FIXED mode it is the entered amount (defaulting to 0).
 */
export function dealAmountCents(input: DealValueInput): number {
  if (input.valueMode === "EFFORT") {
    return effortAmountCents({
      hoursPerWeek: input.hoursPerWeek,
      hourlyRateCents: input.hourlyRateCents,
      effortPeriod: input.effortPeriod,
    });
  }
  return input.amountCents ?? 0;
}
