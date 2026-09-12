# Mahnwesen (Dunning)

Kundeo-owned dunning over finalized FreeFinance invoices: an escalating ladder
of Mahnstufen with configurable fees and Verzugszinsen, sent by email on the
in-process ticker. Additive, capability-gated, self-host-first.

## Why Kundeo owns it (design decision)

The original intent was to write Mahnungen back to FreeFinance ("FreeFinance
full"). **Spike 0 disproved this: the FreeFinance 2.0 API (`2.0.0-beta9`, 164
paths) exposes no dunning/reminder resource** — no `inv/reminders`, no
`reminder_level`/`mahnstufe` field, and `INV-DN` is *Delivery Notes*, not
dunning. FreeFinance only lets you filter invoices by `OVERDUE` and read/register
payments.

So Kundeo owns the whole process:

- Computes **Verzugszinsen** (pro-rata annual rate) and **Mahngebühren**.
- Sends each Mahnung by email, attaching the original FreeFinance invoice PDF
  (best-effort — the Mahnung still goes out if the PDF is unavailable).
- Reads payment facts **in** from FreeFinance (`getPayments`); a payment stops
  the ladder automatically.

This keeps the feature working on a self-host instance with the default `log`
email transport and no external service. It is capability-gated behind invoices
(which today require FreeFinance); if a native invoice path is ever added,
dunning rides the same `Document` rows unchanged.

## Data model (`packages/db`)

- `DunningPolicy` — one per org: `graceDays` (wait after due date before Stufe 1),
  `intervalDays` (cadence between Stufen), `isActive`.
- `DunningLevel` — one rung: `level` (1..N), `label`, `feeCents`, `interestBps`
  (annual rate in basis points), `emailTemplateId?`.
- `DunningRun` — audit row per Mahnung sent: computed `feeCents`/`interestCents`/
  `openCents`, `emailStatus` (SENT | LOGGED | SKIPPED), `detail`.
- `Document` gains `dunningLevel`, `dunningPausedUntil`, `lastDunnedAt`.

Migration `20260912110926_dunning` (+ RLS block for the three tables; `dunning_level`
scoped via its parent policy). Default seed: 3 Stufen — Zahlungserinnerung,
1. Mahnung, 2. Mahnung — **no Inkasso step**. After the last rung the invoice is
flagged "maximale Mahnstufe erreicht" for manual handling.

## Engine (`apps/web/lib/dunning`)

- `math.ts` — pure, unit-tested (`math.test.ts`): `isDunningDue`,
  `nextDunningDueAt`, `computeInterestCents`, `openCents`. Stufe `L+1` is due at
  `dueDate + graceDays + L*intervalDays`.
- `sweep.ts` — `drainDueDunning(now)` sweeps every org with an active policy;
  `dunInvoiceNow(org, id)` is the manual "Jetzt mahnen". Concurrency-safe via a
  **guarded level bump** (the lease): only the caller that advances
  `dunningLevel` from the value it read proceeds. Network I/O (PDF fetch, email
  send) runs **after** the claim transaction commits, per the outbox rule. A
  crash between claim and audit-row loses only the `DunningRun`, never escalates
  twice.
- Wired into `lib/automations/ticker.ts` alongside the automation and
  FreeFinance sweeps — no new process or infra.

## Consent

Mahnung emails are sent directly through `lib/email`, **not** the `email.send`
automation action, so the DSGVO consent gate does not apply (contractual /
legitimate-interest basis).

## UI

- **Settings → Mahnwesen** (`components/settings/dunning-tab.tsx`,
  `settings/dunning-actions.ts`, admin-only): edit fences and the 3-rung ladder.
- **Invoices list**: a "Mahnstufe" column.
- **Invoice detail**: a Mahnwesen card (current Stufe, next due date, "Jetzt
  mahnen", pause/resume) and Mahnung entries in the Verlauf
  (`lib/freefinance/detail.ts`, `invoices/dunning-actions.ts`).

## Follow-ups (out of scope for v1)

- Generate a dedicated Mahnung PDF (v1 attaches the original invoice PDF).
- Automation trigger `invoice.overdue` + a `Document` `RecordType` so workflows
  can react to Mahnstufen (needs `lib/automations/records.ts` changes).
- Multi-process safety beyond the single-process self-host ticker.
