import { test } from "node:test";
import assert from "node:assert/strict";
import { daysOverdue, nextDunningDueAt, isDunningDue, computeInterestCents, openCents } from "./math";

const policy = { graceDays: 3, intervalDays: 7 };
const due = new Date("2026-01-01T00:00:00Z");

test("daysOverdue: never negative before/at the due date", () => {
  assert.equal(daysOverdue(due, new Date("2025-12-20T00:00:00Z")), 0);
  assert.equal(daysOverdue(due, new Date("2026-01-01T00:00:00Z")), 0);
});

test("daysOverdue: whole days after the due date", () => {
  assert.equal(daysOverdue(due, new Date("2026-01-11T00:00:00Z")), 10);
});

test("nextDunningDueAt: Stufe 1 lands graceDays after the due date", () => {
  assert.equal(nextDunningDueAt(due, 0, policy).toISOString(), "2026-01-04T00:00:00.000Z");
});

test("nextDunningDueAt: each further Stufe adds intervalDays", () => {
  assert.equal(nextDunningDueAt(due, 1, policy).toISOString(), "2026-01-11T00:00:00.000Z");
  assert.equal(nextDunningDueAt(due, 2, policy).toISOString(), "2026-01-18T00:00:00.000Z");
});

test("isDunningDue: true once the grace period has passed", () => {
  const base = { dueDate: due, openCents: 12000, currentLevel: 0, maxLevel: 3, pausedUntil: null, policy };
  assert.equal(isDunningDue({ ...base, now: new Date("2026-01-03T00:00:00Z") }), false);
  assert.equal(isDunningDue({ ...base, now: new Date("2026-01-04T00:00:00Z") }), true);
});

test("isDunningDue: false when fully paid, capped, or paused", () => {
  const now = new Date("2026-02-01T00:00:00Z");
  const base = { dueDate: due, openCents: 12000, currentLevel: 1, maxLevel: 3, pausedUntil: null, policy, now };
  assert.equal(isDunningDue({ ...base, openCents: 0 }), false, "paid");
  assert.equal(isDunningDue({ ...base, currentLevel: 3 }), false, "capped at maxLevel");
  assert.equal(isDunningDue({ ...base, pausedUntil: new Date("2026-03-01T00:00:00Z") }), false, "paused");
});

test("isDunningDue: false without a due date", () => {
  assert.equal(
    isDunningDue({ dueDate: null, openCents: 12000, currentLevel: 0, maxLevel: 3, pausedUntil: null, policy, now: new Date() }),
    false,
  );
});

test("computeInterestCents: pro-rata annual rate on the open amount", () => {
  // 100,00 € open, 9,2 % p.a. (920 bps), 30 days overdue → 100 * 0.092 * 30/365 ≈ 0,7562 € → 76 cents
  assert.equal(computeInterestCents(10000, 920, 30), 76);
});

test("computeInterestCents: zero when rate, open, or days are non-positive", () => {
  assert.equal(computeInterestCents(10000, 0, 30), 0);
  assert.equal(computeInterestCents(0, 920, 30), 0);
  assert.equal(computeInterestCents(10000, 920, 0), 0);
});

test("openCents: clamps a fully/over-paid invoice to zero", () => {
  assert.equal(openCents(12000, 5000), 7000);
  assert.equal(openCents(12000, 12000), 0);
  assert.equal(openCents(12000, 13000), 0);
});
