# FreeFinance integration — plan

> Status: **Design / proposal**. Nothing in this document is implemented yet.
> Scope: sync **customers**, **offerings (items)**, and **offers + invoices** from
> Kundeo into [FreeFinance](https://freefinance-dev.github.io) (Austrian
> accounting SaaS); **build Angebote (offers) in Kundeo by pulling the FreeFinance
> item catalogue** (with Rabatte/discounts, per-line Konto/account) and posting
> them back; **pull finalized offer & invoice PDFs back into Kundeo** so they can
> be sent from Kundeo's own email system; plus payment-status read-back.

> **Two headline requirements** (confirmed with the requester):
> 1. **Angebote-Builder** — the offer editor in Kundeo pulls selectable **line
>    items from FreeFinance** (`GET /itm/items`, incl. price, Konto, Steuersatz),
>    lets the user apply **Rabatte** (per-line and total) and choose the account,
>    then posts the offer back to FreeFinance. Validated live (§2, §7.3).
> 2. **PDF flow-back** — finalized **Angebot and Rechnung PDFs are fetched back**
>    and handed to Kundeo's **email templating system** (planned in parallel) as
>    attachments, so documents are sent from Kundeo, not FreeFinance. Validated
>    live (§7.6). The seam to the email system is defined in §7.6.

All API claims below were **validated live** against the FreeFinance dev
instance (`demo.freefinance.at`, client `6163`) with the provided dev
credentials — see [§2 Validated flow](#2-validated-flow-proof).

---

## 1. Executive summary

FreeFinance is a REST accounting product for the DACH market (strong AT focus:
UID/USt handling, e-invoice/ebInterface & XRechnung, double-entry *and*
cash-based bookkeeping). It maps cleanly onto Kundeo's domain:

| Kundeo concept | FreeFinance resource | Module |
|---|---|---|
| Company / Contact (billing party) | `mas/customers` (master data) | MAS |
| Product / Offering | `itm/items` | ITM |
| Deal → quote | `inv/offers` | INV (Plus) |
| Deal (won) → invoice | `inv/invoices` (PDF, numbering, e-invoice) | INV (Plus) |
| Invoice (bookkeeping only, no PDF) | `cbi/outgoing_invoices` | CBI (fallback) |
| Payment status read-back | `inv/invoices/{id}/payments`, `.../pay` | INV / CBI |

**How this fits Kundeo's OSS-first / hosting-aware principles**

- **Self-hosted works fully without FreeFinance.** The integration is an
  *additive, capability-gated layer*. If no FreeFinance credentials are
  configured the feature is invisible and every existing CRM flow is unchanged.
- **Swappable behind an interface** — same pattern as the email sender
  (`apps/web/lib/email/index.ts`): a `FreeFinanceClient` interface with a real
  HTTP implementation and a no-op/log default, resolved from config.
- **No core-table reshape for hosting.** External-id mapping and credentials live
  in *new additive tables*, not new columns on `Company`/`Contact`/`Deal`.
  Credentials resolve **env-first (self-host, single org) → per-org DB row
  (hosted, many orgs)**, so hosting needs no code fork.
- **Tenant-scoped from day one** — every new row carries `organizationId` and an
  RLS policy; all access goes through `scoped()` / `withOrg()`.

---

## 2. Validated flow (proof)

Run end-to-end against the dev instance on 2026-09-12. This is the exact happy
path the integration automates:

```
POST {IDP}/token  (grant_type=client_credentials)      → access_token (TTL ~300s)
GET  /api/2.0/clients                                   → client 6163 "Doppelte Buchführung" (DEA, PLUS)
GET  /clients/6163/features                             → inv/itm/mas/cbi… ACTIVE
POST /clients/6163/mas/customers {...}                  → 200  id=24833cfa…  customer_number=KDN00088307
POST /clients/6163/itm/items {...}                      → 201  id=f74f0512…
POST /clients/6163/inv/invoices {customer,lines,…}      → 200  id=e4436fe1…  state=STAGING (net 200 / tax 40 / total 240)
POST /clients/6163/inv/invoices/{id}/finalize {...}     → 200  number=R.2026T004  state=FINALIZED
GET  /clients/6163/inv/invoices/{id}/pdf                → 200  application/pdf  (46 KB, 1 page)
GET  /clients/6163/itm/items?limit=…                    → 200  {total_count:34, content:[…price,account,tax…]}  (catalogue pull)
POST /clients/6163/inv/offers {…,lines:[{discount:10,discount_mode:RATE,…}]}  → 200 STAGING (net 180 / tax 36 / total 216)
POST /clients/6163/inv/offers {…,finalize:true,layout_setup}                  → 200 FINALIZED number=A.2026T002
GET  /clients/6163/inv/offers/{id}/pdf                  → 200  application/pdf  (47 KB, 1 page)
```

Findings that shaped the design (each cost a 400 before it worked):

- **Customer create**: `company_name` **or** (`first_name`+`last_name`) required;
  `ignore_in_bsa` is the only strictly-required boolean. Email is
  format-validated server-side (a `.example` TLD was rejected). Response returns
  a UUID `id`, an auto `customer_number`, and an auto-created contra account.
- **Item create**: requires **both** `account` (an income account id) **and** an
  explicit `taxes.tax_1.tax_class_entry` — the account's default tax is *not*
  auto-applied. `unit_of_measure` must be a valid `fnd` code (`H`, not `HUR`).
- **Invoice lines** are **verification-checked**: you must send `net`, `total`,
  and per-line `taxes.tax_N.amount`, and the document `net`/`tax`/`total` must
  equal the sum of lines or the call 400s. `item_defaulting:true` pulls
  name/account/unit from the referenced item; address + due date are derived from
  the customer + default payment term.
- **Finalize** needs a **valid `layout_setup`** and (because e-invoicing is
  configured on this client) an `e_invoice_version` (`NONE` to skip). Finalize is
  irreversible — a finalized invoice can only be cancelled, never edited/deleted.
- **Offers**: same shape as invoices but require `expiration_date`. A staging
  offer/invoice has **no PDF** (`404 record-not-found`); creating with
  `finalize:true` + `layout_setup` in one call yields an immediate `FINALIZED`
  document **with number and PDF** (offer `A.2026T002`, 47 KB) — so PDF flow-back
  needs no separate finalize step for offers.
- **Rabatt (discount)** is per-line: `discount` + `discount_mode`
  (`RATE`=percent, `CONSTANT`=amount). Validated: a 10% line Rabatt on net 200
  produced net 180 / tax 36 / total 216 (verification still enforced on the
  discounted figures). Document-level discount = a line of `type:"TOTAL_DISCOUNT"`;
  a customer can also carry a default `discount` %.

---

## 3. API reference (as used here)

### 3.1 Auth — OIDC client credentials (technical user)

- **Token endpoint** (dev): `https://accounts.freefinance.at/auth/realms/demo/protocol/openid-connect/token`
  - Discover per-instance via unauthenticated `GET {base}/api/2.0/auth/issuer`
    → `{ "url": "…/realms/demo", "realm": "demo" }`; append
    `/protocol/openid-connect/token`.
- `grant_type=client_credentials`, `client_id`, `client_secret` (form-encoded).
- **Access token TTL ≈ 300 s, no refresh token.** ⇒ cache the token in memory and
  re-fetch shortly before expiry (mirror the M365 token cache in
  `apps/web/lib/email/index.ts:90-127`).
- Every API call: `Authorization: Bearer {token}`.
- The dev `client_id` encodes `{mandant}_{userId}` (`6163_70819774`); the
  **numeric client id** used in every path (`6163`) is the *Mandant*, obtained
  from `GET /clients`, **not** the OAuth client_id.

### 3.2 Base URL & path shape

- Base: `https://demo.freefinance.at/api/2.0` (dev). Env-configurable; prod is a
  different host. `servers` in the spec = `https://demo.freefinance.at`.
- **Every tenant resource is nested under the client id**:
  `/clients/{client_id}/{module}/{resource}`. Module codes: `mas` (master
  data / customers & suppliers), `itm` (items), `inv` (invoicing — Plus),
  `cbi` (in/out invoices — bookkeeping), `cbs` (accounts, payment accounts),
  `fis` (tax classes/rates), `fnd` (reference data, **not** client-scoped:
  `/fnd/countries|currencies|languages|salutations|units_of_measure`),
  `doc` (documents), `tag`, `pos`, `bsl`, `cba`.

### 3.3 Conventions

- JSON, **snake_case**, ISO dates (`YYYY-MM-DD`).
- **Lists**: `{ total_count, content: [...] }` with `limit` / `offset` / `sort`
  query params. Iterate with offset paging.
- **References**: responses embed nested objects; **requests take ids only**.
- **Errors** (validated shape):
  `{ "error": "cbs-account-tax-information-invalid", "message": "…(localised DE)…", "identifier": "yNenfS", "details": [], "payload": [...] }`.
  `error` is a stable machine code; `message` is German UI text; `identifier` is a
  support correlation id — **log it**.
- **Amounts are decimal numbers** (e.g. `100.0`, `240.0`) — **not** minor units.
  Kundeo stores `amountCents` (int); convert `cents/100` on the way out and
  `round(x*100)` on the way back. Money is the integration's sharpest edge.

### 3.4 Reference data to cache per client (ids are UUIDs, per-Mandant)

| Purpose | Endpoint | Notes |
|---|---|---|
| Income accounts | `GET /clients/{id}/cbs/accounts?use=INV` | line/item `account` |
| Tax class entries | `GET /clients/{id}/fis/tax_classes/{tc}/entries` | `tax_class_entry` id per VAT rate (e.g. 20% = code `020`) |
| Default payment term | `GET /clients/{id}/inv/payment_terms/default` | drives due date |
| Default sequence group | `GET /clients/{id}/inv/document_sequence_groups/default` | invoice numbering |
| Default layout | `GET /clients/{id}/inv/layout_setups/default` | **required at finalize** |
| Units of measure | `GET /fnd/units_of_measure` | `H`, `STK`, … |
| Feature flags | `GET /clients/{id}/features` | gate INV vs CBI (see §8) |

These change rarely — cache with a short TTL per `(orgId, clientId)`.

---

## 4. Architecture in Kundeo

```
apps/web/lib/freefinance/
  client.ts        FreeFinanceClient interface + HttpFreeFinanceClient + NoopFreeFinanceClient
  auth.ts          token cache (per client_id), client_credentials grant
  config.ts        resolveFreeFinanceConfig(orgId) → env-first, then OrgIntegration row
  crypto.ts        AES-GCM encrypt/decrypt for stored client_secret (KUNDEO_ENCRYPTION_KEY)
  mappers.ts       Kundeo ⇄ FreeFinance field mapping (pure functions, unit-testable)
  refdata.ts       cached reference-data lookups (accounts, tax entries, defaults, item catalogue)
  sync.ts          orchestration: syncCustomer / syncItem / createOffer / createInvoice
  documents.ts     getDocumentPdf() → DocumentAttachment for the email system (§7.6)
  errors.ts        FreeFinanceApiError (carries error/identifier), retryable?() classifier
  index.ts         getFreeFinanceClient() / setFreeFinanceClient() (test seam)
```

Rationale: mirrors `apps/web/lib/email/` (the established swappable-interface
precedent) rather than a new package — it's web-only today and can be promoted to
`packages/freefinance` later if a worker/hosted service needs it.

### 4.1 Outbound HTTP — reuse the SSRF-safe pattern

All calls reuse the hardening from `apps/web/lib/automations/runner.ts:195-214`:
`AbortController` 10 s timeout + `redirect: "manual"`. FreeFinance is a **fixed,
env-configured host**, so instead of per-request DNS guarding:

- Validate the configured base host **once** at config load against
  `assertPublicHttpUrl` (`apps/web/lib/automations/url-guard.ts`) and, in hosted,
  pin it to an allowlist (`accounts.freefinance.at` + the API host). Self-host may
  point at `demo.` (dev) or the prod host via env.
- Keep the timeout + `redirect:"manual"` on every call.

### 4.2 Credentials & config (env-first, per-org fallback)

`resolveFreeFinanceConfig(orgId)`:

1. **Self-host / single-tenant default** — env:
   `KUNDEO_FREEFINANCE_BASE_URL`, `KUNDEO_FREEFINANCE_CLIENT_ID`,
   `KUNDEO_FREEFINANCE_CLIENT_SECRET`, `KUNDEO_FREEFINANCE_MANDANT` (numeric
   client id). If present → use them (matches the email module's env approach).
2. **Hosted / per-org** — a new **`OrgIntegration`** row (see §5), secret
   **encrypted at rest** (AES-GCM, key from `KUNDEO_ENCRYPTION_KEY`). This is the
   additive hosting layer; core tables untouched.
3. Neither → `NoopFreeFinanceClient`; UI shows "not connected".

> Deliberately **not** stored in `Organization.metadata`: that column is
> unencrypted and read via the RLS-bypassing bare `prisma` client
> (`settings/actions.ts:17`). A client_secret must not live there.

### 4.3 Async & retries

- **Automation-triggered** syncs run through the existing **post-commit outbox**
  (`flushOutbox`, `runner.ts:239-272`): add a `"freefinance"`
  `PendingSideEffect` kind (`actions-exec.ts:26-31`) that runs *after* the DB
  transaction commits — executors must never do network I/O inside the txn.
- **Direct/manual** syncs (buttons) call `sync.ts` inline and return the German
  `ActionResult` (`settings/actions.ts:9`) shape.
- **Retryable failures** (5xx, network, token) → a small **`FreeFinanceSyncJob`**
  table swept by the existing ticker (`ticker.ts`), reusing the atomic
  `WAITING→RUNNING` claim idiom (`runner.ts:332`) + exponential backoff. 4xx
  validation errors are **terminal** (surface to the user, don't retry).

---

## 5. Data-model changes (Prisma)

Kundeo currently has **no Product, Invoice, or Integration model** — these are
introduced here. Every new table: `id @default(cuid())`, `organizationId`,
`@@index([organizationId])`, `onDelete: Cascade`, money as `Int` cents, **and a
matching RLS policy in `packages/db/prisma/rls.sql`** (the real tenant boundary).

```prisma
// Per-org integration credentials (additive hosting layer; secret encrypted).
model OrgIntegration {
  id             String   @id @default(cuid())
  organizationId String
  provider       String   // "freefinance"
  baseUrl        String
  clientId       String
  clientSecret   String   // AES-GCM ciphertext, never plaintext
  mandant        String   // numeric FreeFinance client id
  enabled        Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  @@unique([organizationId, provider])
  @@index([organizationId])
}

// Generic external-id mapping — keeps Company/Contact/Deal/Product untouched
// and supports multiple providers (additive principle). Idempotency key.
model ExternalRef {
  id             String   @id @default(cuid())
  organizationId String
  provider       String   // "freefinance"
  entityType     String   // "customer" | "item" | "invoice" | "offer"
  entityId       String   // Kundeo row id (Company/Contact/Product/Invoice)
  externalId     String   // FreeFinance UUID
  externalNumber String?  // e.g. invoice number R.2026T004, customer_number
  syncedAt       DateTime @default(now())
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  @@unique([organizationId, provider, entityType, entityId])
  @@index([organizationId, provider, externalId])
}

// Kundeo offering catalogue ⇄ FreeFinance items.
model Product {
  id             String   @id @default(cuid())
  organizationId String
  name           String
  description    String?
  sku            String?
  unitPriceCents Int      @default(0)
  currency       String   @default("EUR")
  vatRate        Int      @default(20)   // percent; mapped to a tax_class_entry
  unit           String?  // FreeFinance unit_of_measure code, e.g. "H"
  active         Boolean  @default(true)
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  @@index([organizationId])
}

// Kundeo-side invoice record; FreeFinance remains system-of-record for the PDF/number.
model Invoice {
  id             String   @id @default(cuid())
  organizationId String
  companyId      String?
  contactId      String?
  dealId         String?
  status         String   @default("DRAFT") // DRAFT|STAGING|FINALIZED|PAID|CANCELLED
  currency       String   @default("EUR")
  netCents       Int      @default(0)
  taxCents       Int      @default(0)
  totalCents     Int      @default(0)
  issueDate      DateTime?
  dueDate        DateTime?
  externalNumber String?  // R.2026T004
  lines          InvoiceLine[]
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  @@index([organizationId])
}

model InvoiceLine {
  id           String  @id @default(cuid())
  invoiceId    String
  productId    String?
  name         String
  quantity     Decimal
  unitPriceCents Int
  vatRate      Int
  netCents     Int
  taxCents     Int
  totalCents   Int
  invoice      Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  @@index([invoiceId])
}
```

> Alternative considered: nullable `freefinanceId` columns on existing tables.
> Rejected in favour of `ExternalRef` so core CRM tables stay provider-agnostic
> (hosting principle) and multiple accounting integrations remain possible.

---

## 6. Field mappings (Kundeo → FreeFinance)

### 6.1 Company / Contact → `mas/customers`

| FreeFinance | Source | Notes |
|---|---|---|
| `company_name` | `Company.name` | for company billing |
| `first_name` / `last_name` | `Contact.firstName/lastName` | when billing a person; one of company/person name is required |
| `salutation_code` / `comp_salutation_code` | `Contact.salutation` | map via `GET /fnd/salutations` (`Herr`→`MR`, `Frau`→`MRS`, company→`COM`) |
| `title` | `Contact.title` | |
| `tax_number` | `Company.vatId` | UID/USt-IdNr.; set `no_vat_number:false` |
| `email_address` | `Contact.email` / company | server-validates format |
| `tel_number` / `mobile_number` | `Contact.phone` | |
| `street_name` + `street_number` | split from `Company.street` | FF wants them separate |
| `zip_code` / `city` | `Company.postalCode` / `city` | |
| `country` | `Company.country` (`DE/AT/CH`) | FF short code |
| `region` | derived / optional | FF auto-derives from zip+city (observed) |
| `ignore_in_bsa` | `false` | required boolean |
| `visible` | `true` | |

Persist the returned `id` + `customer_number` in `ExternalRef`
(`entityType:"customer"`). Re-sync = `PUT /mas/customers/{id}` when a ref exists.

### 6.2 Product → `itm/items`

| FreeFinance | Source | Notes |
|---|---|---|
| `name` | `Product.name` | required |
| `number` | `Product.sku` | |
| `account` | mapped income account | default: `4000` "Einnahmen (Erlöse)"; make configurable |
| `amount_type` | `NET` | Kundeo prices are net |
| `selling_price` | `Product.unitPriceCents / 100` | decimal |
| `currency` | `Product.currency` | |
| `unit_of_measure` | `Product.unit` | valid `fnd` code (`H`,`STK`,…) |
| `taxes.tax_1.tax_class_entry` | from `Product.vatRate` | **required**; resolve via tax-class entries (20%→code `020`) |

### 6.3 Deal → `inv/offers` (quote) / `inv/invoices` (invoice)

| FreeFinance | Source | Notes |
|---|---|---|
| `customer` | `ExternalRef` for Company/Contact | sync customer first |
| `date` | today / `Deal.closedAt` | required |
| `expiration_date` | offer only | required for offers |
| `lines[]` | `InvoiceLine[]` (or Deal value) | see verification rules below |
| `payment_term` | default or configured | drives `due_date` |
| `net` / `tax` / `total` | summed from lines | **must reconcile** |
| `finalize` | `false` first, finalize as explicit step | keeps a draft/staging stage |

**Per line** (verified requirement): `item` (id) + `item_defaulting:true`,
`amount` (qty), `item_price`, `price_type:"NET"`, optional **`discount`** +
**`discount_mode`** (`RATE`|`CONSTANT`), per-line **`account`** (Konto; defaults
from the item when omitted), `net`, `total`, and
`taxes.tax_1 = { tax_class_entry, amount }`. Compute tax as
`round(netAfterDiscount * rate/100)`; ensure `Σ line.net == doc.net`,
`Σ line.tax == doc.tax`, `Σ line.total == doc.total` (integer-cents math, then
`/100`). **Total discount** = an extra line with `type:"TOTAL_DISCOUNT"`.

A **Deal with no line items** (`valueMode=FIXED`) maps to a single line using a
generic "Leistung" item/account at `Deal.amountCents`.

**Kundeo `InvoiceLine`/offer-line ⇄ FreeFinance line** fields:

| FreeFinance line | Kundeo | Notes |
|---|---|---|
| `item` | `InvoiceLine.productId` → `ExternalRef` | catalogue item id |
| `name` / `item_number` | product / free text | defaulted from item |
| `amount` | `quantity` | qty |
| `item_price` | `unitPriceCents/100` | net unit price |
| `discount` + `discount_mode` | line Rabatt | `RATE` %, `CONSTANT` € |
| `account` | product/org income account | Konto override per line |
| `taxes.tax_1.tax_class_entry` + `amount` | `vatRate` | resolved to tce id |
| `net` / `total` | `netCents/100` / `totalCents/100` | verification-checked |

---

## 7. Sync flows

### 7.1 Customer sync (Company/Contact)
Manual button **and** automation action. Upsert by `ExternalRef`: POST if absent
→ store id; PUT if present. Idempotent.

### 7.2 Item sync (Product)
Same upsert pattern. Resolve `account` + `tax_class_entry` from reference-data
cache before POST.

### 7.3 Angebote-Builder (offer editor, catalogue-driven) — headline feature

The offer editor in Kundeo is populated **from the FreeFinance item catalogue**:

1. **Pull catalogue** — `GET /clients/{id}/itm/items` (supports
   `?category=&search=&limit=&offset=`); each item carries `selling_price`,
   `account` (Konto), `unit_of_measure` and `taxes` (Steuersatz). Cache with a
   short TTL in `refdata.ts`. The picker shows name/number/price; selection
   pre-fills a line via `item_defaulting`.
2. **Edit lines** — the user sets quantity, per-line **Rabatt** (`discount` +
   `discount_mode`), can override the **Konto** (`account`) and unit, and can add
   a **Gesamtrabatt** line (`type:"TOTAL_DISCOUNT"`). Kundeo computes
   net/tax/total in **integer cents** and shows a live total.
3. **Post back** — `POST /clients/{id}/inv/offers` with `customer`, `date`,
   `expiration_date`, the lines, and reconciled `net`/`tax`/`total`.
   - Draft workflow: `finalize:false` → `state=STAGING` (editable, no PDF).
   - Send-ready: `finalize:true` + `layout_setup` → `state=FINALIZED`, gets an
     offer number (`A.2026T…`) **and a PDF in one call** (validated).
4. Store an `Invoice`-like offer record + `ExternalRef` (`entityType:"offer"`);
   on FINALIZED, capture `externalNumber` and hand the PDF to §7.6.

Ad-hoc lines (no catalogue item) are allowed: send `name` + `item_price` +
`account` + `taxes` without an `item` id.

### 7.4 Invoice creation (from a Deal or an accepted offer)
1. Ensure customer synced (7.1) and line items synced (7.2), or send ad-hoc lines.
2. `POST /inv/invoices` — `finalize:false` for a draft (`STAGING`), or
   `finalize:true` + `layout_setup` + `e_invoice_version:"NONE"` to finalize in
   one call. A staging invoice can be finalized later via `POST …/finalize`.
3. On FINALIZED store `externalNumber` (`R.2026T…`), `status=FINALIZED`, hand PDF
   to §7.6.

### 7.6 PDF flow-back → Kundeo email system — headline feature

Finalized **Angebot** and **Rechnung** PDFs are pulled back so Kundeo sends them
itself (via the parallel email-templating work), instead of FreeFinance sending.

- **Fetch**: `GET /clients/{id}/inv/{offers|invoices}/{docId}/pdf` →
  `application/pdf` bytes (validated: offer 47 KB, invoice 46 KB). Only available
  once the document is `FINALIZED`.
- **Seam** — a single method the email system consumes, decoupled from FreeFinance:
  ```ts
  // apps/web/lib/freefinance/documents.ts
  export interface DocumentAttachment {
    filename: string;      // e.g. "Angebot_A.2026T002.pdf" / "Rechnung_R.2026T004.pdf"
    contentType: string;   // "application/pdf"
    bytes: Uint8Array;
  }
  getDocumentPdf(orgId: string, kind: "offer" | "invoice", externalId: string): Promise<DocumentAttachment>;
  ```
  The email module (planned separately) takes `DocumentAttachment[]` — this is the
  contract to align on with that agent. Filename is built from `externalNumber`.
- **Storage**: **fetch-on-demand** by default (no binary in Postgres). When the
  swappable **file-storage interface** (CLAUDE.md, not yet built) lands, cache the
  PDF there keyed by `(orgId, provider, externalId)`; self-host = local disk,
  hosted = object store — same additive-swap principle as the email sender.
- **Trigger**: on finalize, enqueue an outbox/`FreeFinanceSyncJob` step that
  fetches the PDF and (optionally) kicks the email template send. This keeps the
  network fetch out of the request path and gives retries.

> **Coordinate with the email-templating agent** on: the `DocumentAttachment`
> shape above, who owns "send" (email module pulls via `getDocumentPdf`, or
> FreeFinance side pushes an attachment into a send call), and filename/locale
> conventions.

### 7.7 Payment status read-back
Poll (ticker) or on-open: `GET /inv/invoices/{id}/payments`; reflect
paid/open into `Invoice.status`. Recording a payment (optional) via
`POST …/payments/by_payment_account` using a `cbs/payment_accounts` id.

### 7.8 CBI fallback (no Plus / no PDF needed)
If `features` lacks `inv`, use `POST /cbi/outgoing_invoices` — records the invoice
for bookkeeping (line requires `account`, `amount`, `amount_type`, `taxes`) but
produces **no PDF/number/layout**. Gate this in `refdata.ts`/`config`.

---

## 8. Edition & capability gating

- **Self-host, no FreeFinance** → feature hidden; zero new required env. ✅ OSS-first.
- **Self-host + FreeFinance** → env creds, single Mandant.
- **Hosted** → per-org `OrgIntegration`, many Mandanten, encrypted secrets.
- **INV (Plus) vs CBI** → decided per client from `GET /clients/{id}/features`;
  surface "Rechnungs-PDFs erfordern das FreeFinance-Plus-Paket" when only CBI.

---

## 9. UI (German copy)

- **Settings → Integrationen → FreeFinance**: connect form (Base-URL, Client-ID,
  Client-Secret, Mandant), **"Verbindung testen"** (calls `GET /clients`), status
  badge, income-account & default-VAT pickers. Server actions return
  `ActionResult` with German errors (`settings/actions.ts` pattern).
- **Company/Deal detail**: "An FreeFinance senden" / "Rechnung erstellen" /
  "Rechnung abschließen" / "PDF herunterladen" buttons.
- **Automations**: new nodes in `components/automations/catalogue.ts`
  (`freefinance.customer.sync`, `freefinance.invoice.create`) + `REQUIRED_CONFIG`
  entries; executor in `actions-exec.ts` returning a `"freefinance"` side-effect.

---

## 10. Security checklist (run `security-review` before merge)

- Client secret **encrypted at rest**; never logged, never in `Organization.metadata`.
- All access via `scoped()`/`withOrg()`; RLS policies added for all 5 new tables.
- Outbound host validated + allowlisted; timeout + `redirect:"manual"` on every call.
- Token cached in memory only, per-org keyed; never persisted, never returned to client.
- `ExternalRef.externalId` scoped by `organizationId` to prevent cross-tenant id confusion.
- Log FreeFinance `identifier` on error; never log tokens/secrets.

---

## 11. Phased implementation

| Phase | Deliverable | Key files |
|---|---|---|
| **0. Spec pin** | Vendor `openapi.json`, generate/curate types | `apps/web/lib/freefinance/types.ts` |
| **1. Client + auth** | Token cache, `HttpFreeFinanceClient`, `GET /clients`, "test connection" | `freefinance/{client,auth,config,crypto}.ts` |
| **2. Schema** | `OrgIntegration`, `ExternalRef`, `Product`, `Invoice(+Line)` + migration + **RLS** | `packages/db/prisma/{schema.prisma,rls.sql,migrations}` |
| **3. Customers** | Company/Contact → `mas/customers` upsert + settings UI | `freefinance/{mappers,sync}.ts`, settings action/page |
| **4. Items** | Product model + catalogue UI + `itm/items` upsert **+ catalogue pull for the offer builder** | products route group, `refdata.ts` |
| **5a. Angebote-Builder** | Offer editor pulling FF item catalogue, Rabatte, per-line Konto, post back, finalize | offer route group, `sync.ts`, `mappers.ts` |
| **5b. Invoicing** | Deal/accepted-offer → invoice, staging→finalize | invoice route group |
| **5c. PDF flow-back** | `getDocumentPdf()` + `DocumentAttachment` seam; hand-off to email system | `freefinance/documents.ts`, `app/api/.../pdf`, **coordinate w/ email agent** |
| **6. Automations** | `freefinance.*` actions via outbox side-effect | `actions-exec.ts`, `runner.ts`, `catalogue.ts` |
| **7. Async/retry** | `FreeFinanceSyncJob` + ticker sweep + backoff; payment read-back | `ticker.ts`, `freefinance/sync.ts` |
| **8. Hardening** | `security-review`, integration tests against dev instance | — |

---

## 12. Open decisions

1. **Income-account & VAT mapping** — single default (`4000`, 20%) vs per-product
   configurable? (Recommend: org default + per-Product override.)
2. **Kundeo as invoice UI, or thin pass-through?** — do we build an invoice
   editor, or only "create from Deal + finalize in FreeFinance"? (Recommend:
   thin pass-through first; FreeFinance owns the document.)
3. **e-invoice** — expose `e_invoice_version` (ebInterface/XRechnung) in UI, or
   always `NONE` initially? (Recommend: `NONE` in phase 5, add later.)
4. **Sync direction** — one-way (Kundeo→FF) confirmed; read-back limited to
   payment status. Any need to import FF customers into Kundeo?
5. **`packages/freefinance`** — promote from `apps/web/lib` once a hosted worker
   needs it?
6. **PDF send ownership** (with the email-templating agent) — does the email
   module pull PDFs via `getDocumentPdf()`, or does a FreeFinance send-flow push
   `DocumentAttachment[]` into the email send? Agree the `DocumentAttachment`
   contract (§7.6) and filename/locale conventions.
7. **PDF caching** — fetch-on-demand until the file-storage interface exists, then
   cache? Or always on-demand (simpler, one extra API call per send)?

---

## Appendix — dev environment

- Docs: <https://freefinance-dev.github.io> · Spec: `…/openapi.json` (OpenAPI 3.1,
  164 paths, 236 schemas, `2.0.0-beta9`).
- Base: `https://demo.freefinance.at/api/2.0` · Realm/IDP:
  `https://accounts.freefinance.at/auth/realms/demo`.
- Mandant `6163` "Doppelte Buchführung" (DEA, PLUS package, INV active).
- Dev credentials are in the team vault — **never commit them**; they belong in
  `.env` (git-ignored) / the hosted secret store.
```
