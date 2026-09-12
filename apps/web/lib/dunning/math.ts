/**
 * Pure Mahnwesen arithmetic — no I/O, no database, fully unit-testable. The
 * dunning sweep (./sweep) owns the side effects; everything that decides *when*
 * a Mahnung is due and *how much* it costs lives here so the DACH-sensitive
 * money math can be tested in isolation.
 *
 * Money is integer minor units (cents) throughout, per the project rule.
 */

const DAY_MS = 86_400_000;

export interface DunningPolicyShape {
  /** Days after the invoice due date before the first Mahnstufe. */
  graceDays: number;
  /** Days between subsequent Mahnstufen. */
  intervalDays: number;
}

/** Whole days an invoice is overdue as of `now` (never negative). */
export function daysOverdue(dueDate: Date, now: Date): number {
  const diff = Math.floor((now.getTime() - dueDate.getTime()) / DAY_MS);
  return diff > 0 ? diff : 0;
}

/**
 * When the Mahnstufe *after* `currentLevel` becomes due. Stufe 1 is due
 * `graceDays` after the due date; each further Stufe follows `intervalDays`
 * later. `currentLevel` is the highest Stufe already sent (0 = none yet), so
 * the next Stufe is `currentLevel + 1`, due at
 *   dueDate + graceDays + currentLevel * intervalDays.
 */
export function nextDunningDueAt(dueDate: Date, currentLevel: number, policy: DunningPolicyShape): Date {
  const offsetDays = policy.graceDays + Math.max(0, currentLevel) * policy.intervalDays;
  return new Date(dueDate.getTime() + offsetDays * DAY_MS);
}

/**
 * Whether the next Mahnstufe is due for an invoice. Requires a due date, an
 * open amount, a ladder rung left, and no active pause.
 */
export function isDunningDue(args: {
  dueDate: Date | null;
  openCents: number;
  currentLevel: number;
  maxLevel: number;
  pausedUntil: Date | null;
  policy: DunningPolicyShape;
  now: Date;
}): boolean {
  const { dueDate, openCents, currentLevel, maxLevel, pausedUntil, policy, now } = args;
  if (!dueDate) return false;
  if (openCents <= 0) return false;
  if (currentLevel >= maxLevel) return false;
  if (pausedUntil && pausedUntil.getTime() > now.getTime()) return false;
  return nextDunningDueAt(dueDate, currentLevel, policy).getTime() <= now.getTime();
}

/**
 * Verzugszinsen: annual rate in basis points applied pro-rata over the days
 * overdue on the open amount. `openCents * rate * days / 365`, rounded to the
 * nearest cent. A zero rate (or non-positive open/days) yields 0.
 */
export function computeInterestCents(openCents: number, interestBps: number, days: number): number {
  if (openCents <= 0 || interestBps <= 0 || days <= 0) return 0;
  return Math.round((openCents * interestBps * days) / (10_000 * 365));
}

/** The invoice's still-open amount. */
export function openCents(totalCents: number, paidCents: number): number {
  const open = totalCents - paidCents;
  return open > 0 ? open : 0;
}
