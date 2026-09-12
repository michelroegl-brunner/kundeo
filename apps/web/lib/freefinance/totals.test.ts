import { test } from "node:test";
import assert from "node:assert/strict";
import { lineTotals, documentTotals, reconcile, centsToDecimal, decimalToCents } from "./totals";

test("line: plain net line, 20% VAT", () => {
  const t = lineTotals({ quantity: 2, unitPriceCents: 10000, vatRate: 20 });
  assert.equal(t.netCents, 20000);
  assert.equal(t.taxCents, 4000);
  assert.equal(t.totalCents, 24000);
});

test("line: 10% RATE discount", () => {
  const t = lineTotals({ quantity: 2, unitPriceCents: 10000, discountValue: 10, discountMode: "RATE", vatRate: 20 });
  assert.equal(t.discountCents, 2000);
  assert.equal(t.netCents, 18000); // matches validated offer A.2026T002 (net 180)
  assert.equal(t.taxCents, 3600);
  assert.equal(t.totalCents, 21600);
});

test("line: CONSTANT (euro) discount", () => {
  const t = lineTotals({ quantity: 1, unitPriceCents: 10000, discountValue: 15, discountMode: "CONSTANT", vatRate: 20 });
  assert.equal(t.discountCents, 1500);
  assert.equal(t.netCents, 8500);
  assert.equal(t.taxCents, 1700);
});

test("line: discount cannot exceed net", () => {
  const t = lineTotals({ quantity: 1, unitPriceCents: 1000, discountValue: 999, discountMode: "CONSTANT", vatRate: 20 });
  assert.equal(t.discountCents, 1000);
  assert.equal(t.netCents, 0);
  assert.equal(t.taxCents, 0);
});

test("document: sums item lines", () => {
  const items = [
    { quantity: 2, unitPriceCents: 10000, vatRate: 20 },
    { quantity: 1, unitPriceCents: 5000, vatRate: 20 },
  ];
  const d = documentTotals(items);
  assert.equal(d.subtotalNetCents, 25000);
  assert.equal(d.netCents, 25000);
  assert.equal(d.taxCents, 5000);
  assert.equal(d.totalCents, 30000);
});

test("document: RATE document discount apportioned, tax recomputed", () => {
  const items = [
    { quantity: 1, unitPriceCents: 10000, vatRate: 20 },
    { quantity: 1, unitPriceCents: 10000, vatRate: 20 },
  ];
  const d = documentTotals(items, { value: 10, mode: "RATE" });
  assert.equal(d.discountCents, 2000);
  assert.equal(d.netCents, 18000);
  assert.equal(d.taxCents, 3600);
  assert.equal(d.totalCents, 21600);
});

test("document: discount remainder lands without losing a cent", () => {
  // 3 equal lines, discount of 1 cent must apportion exactly.
  const items = [
    { quantity: 1, unitPriceCents: 100, vatRate: 20 },
    { quantity: 1, unitPriceCents: 100, vatRate: 20 },
    { quantity: 1, unitPriceCents: 100, vatRate: 20 },
  ];
  const d = documentTotals(items, { value: 1, mode: "CONSTANT" });
  assert.equal(d.discountCents, 100);
  assert.equal(d.netCents, 200);
  const sumLineNet = d.lines.reduce((s, l) => s + l.netCents, 0);
  assert.equal(sumLineNet, d.netCents);
});

test("document: mixed VAT rates keep per-rate tax correct", () => {
  const items = [
    { quantity: 1, unitPriceCents: 10000, vatRate: 20 },
    { quantity: 1, unitPriceCents: 10000, vatRate: 10 },
  ];
  const d = documentTotals(items);
  assert.equal(d.netCents, 20000);
  assert.equal(d.taxCents, 3000); // 2000 + 1000
});

test("reconcile: green when provided equals computed", () => {
  const items = [{ quantity: 2, unitPriceCents: 10000, vatRate: 20 }];
  const r = reconcile(items, { netCents: 20000, taxCents: 4000, totalCents: 24000 });
  assert.equal(r.ok, true);
});

test("reconcile: red when totals drift", () => {
  const items = [{ quantity: 2, unitPriceCents: 10000, vatRate: 20 }];
  const r = reconcile(items, { netCents: 20000, taxCents: 3999, totalCents: 24000 });
  assert.equal(r.ok, false);
  assert.equal(r.tax.computed, 4000);
  assert.equal(r.tax.provided, 3999);
});

test("cents ↔ decimal round-trip", () => {
  assert.equal(centsToDecimal(24000), 240);
  assert.equal(decimalToCents(240), 24000);
  assert.equal(centsToDecimal(21600), 216);
});
