# Kundeo - EARLY BUILD!

**Open-source CRM built for the DACH market — self-hostable first, hosting always in mind.**

Kundeo is a customer-relationship manager with a native German UI, DACH domain
model (USt-IdNr., formal salutations, `DE`/`AT`/`CH`, EUR/CHF) and a built-in
**no-code automation engine**. Every feature runs fully on a single self-hosted
instance with no paid external service required — auth, email and data all have
a self-contained default.

License: [AGPL-3.0-only](./LICENSE) · Stack: Next.js 15 · React 19 · Prisma 6 ·
PostgreSQL 17 · Tailwind v4 · Better Auth · Turborepo · pnpm.

---

## Screenshots

**Dashboard** — weighted forecast, open deals, activity feed and due tasks at a glance.

![Kundeo dashboard](docs/screenshots/dashboard.jpg)

| Deal pipeline (Kanban) | Automation builder |
| --- | --- |
| ![Deal pipeline](docs/screenshots/pipeline.jpg) | ![Automation flow builder](docs/screenshots/automation-builder.jpg) |

The automation builder is fully visual and German-language — every node reads as
a plain sentence ("Wenn ein Deal auf ‚Gewonnen' gesetzt wird"), with branches,
conditions, delays and a live run log. No JSON, no `{{ templating }}` in front of
the user.

---

## Features

### CRM
- **Contacts & companies** with DACH fields: `vatId` (USt-IdNr./UID),
  `salutation` (Herr/Frau), formal `title` (Dr./Prof.), address, country
  (`DE`/`AT`/`CH`), industry. DSGVO email consent is tracked per contact.
- **Deal pipeline** as a Kanban board with configurable stages and per-stage
  win probability driving a **weighted forecast**.
- **Effort-based deal value** — deals can be a fixed amount or computed from
  hours/rate over a weekly/monthly/annual period. Money is always stored as
  integer minor units (`amountCents`), never floats.
- **Activities & tasks** — notes, calls, emails, meetings and tasks, with due
  dates, completion and an activity timeline per contact/company/deal.
- **JSON export** of all tenant data via `/api/export`.

### Automations (no-code)
- **Visual flow builder** with triggers, actions, conditions/branches, delays
  and filters — all in German.
- **Triggers**: deal won/created/stage-changed/lost, contact & company
  created/updated/tagged, task created/completed/overdue, fixed **schedules**,
  **relative dates** (e.g. *N days before a renewal or close date*), and inbound
  email.
- **Actions**: create task, add note, send email, move deal, add tag,
  round-robin assign, notify, **webhook**, set field, create record, and
  **sub-flows** (nested automations).
- **Durable execution** — delays suspend a run in the database (no held
  connections) and resume on a 60s ticker; network side-effects (email,
  webhooks) run through a post-commit outbox and are reflected truthfully in the
  run log.
- **Security & compliance built in** — outbound webhooks are **SSRF-guarded**
  (private/loopback/link-local/cloud-metadata IPs blocked, no redirect
  following, optional host allowlist); email sends **respect DSGVO consent** and
  are skipped with an honest log entry when consent is missing.
- Starter **template gallery** to create common workflows in one click.

### Multi-tenancy & security
- Tenant boundary = a Better Auth **organization**. Every tenant-owned row
  carries `organizationId`.
- Isolation is enforced by **PostgreSQL Row-Level Security**, not just `where`
  clauses. The app connects as a restricted, non-owner role; all request-time
  data access goes through `scoped()` / `withOrg()`, which set the active org for
  the transaction so RLS applies.
- Self-host runs a single org; the same schema serves many orgs per database for
  a hosted edition — no reshape needed.

### Pluggable email
Email delivery is swappable behind one interface, chosen by env:
- **`log`** (default) — records the message to the run log, no mail server
  needed. Ideal for self-host out of the box.
- **`smtp`** — any SMTP server via nodemailer.
- **`m365`** — Microsoft 365 / Graph `sendMail` with client credentials.

### FreeFinance integration (optional)
Connect [FreeFinance](https://freefinance.at) (Austrian accounting SaaS) to turn
CRM deals into offers and invoices without leaving Kundeo. Fully **additive and
capability-gated** — with no credentials configured the feature is invisible and
every CRM flow is unchanged.

- **Angebote-Builder** — build offers from the live FreeFinance item catalogue,
  with per-line **Rabatte**, per-line **Konto** override and a live net/tax/total,
  then post them back to FreeFinance.
- **Produkte** — a product catalogue that syncs to FreeFinance `itm/items`.
- **Rechnungen** — create invoices from a deal or an accepted offer, staging →
  finalize (irreversible), with FreeFinance owning numbering and the PDF.
- **PDF flow-back** — finalized Angebot/Rechnung PDFs are pulled back and sent
  from **Kundeo's own email system**, not FreeFinance.
- **Mahnwesen** — a Kundeo-owned dunning ladder over finalized FreeFinance
  invoices (Verzugszinsen + Mahngebühren, escalating Mahnstufen by email). Kundeo
  owns it because the FreeFinance API exposes no dunning resource — see
  [`docs/features/mahnwesen.md`](./docs/features/mahnwesen.md).
- **Automations** — `freefinance.*` actions (customer sync, invoice create) run
  through the durable outbox with a retrying sync-job queue; payment status is
  read back into invoice state.

Credentials resolve **env-first** (self-host, single org) → per-org row (hosted,
secret encrypted at rest). See [`docs/integrations/freefinance.md`](./docs/integrations/freefinance.md)
for the full design.

### MCP access for AI agents (optional)
Connect AI agents (Claude Cowork, Claude Desktop, …) to a workspace's CRM data
over the [Model Context Protocol](https://modelcontextprotocol.io). A remote MCP
server is exposed at **`POST /api/mcp`** (Streamable HTTP transport), with tools
for contacts, companies, deals, pipelines and activities.

- **Self-host first, no external service** — access is granted with
  per-organization **bearer keys** created under *Einstellungen → Integrationen →
  MCP-Zugriff*. The plaintext token is shown once; only its SHA-256 hash is
  stored. Send it as `Authorization: Bearer kundeo_mcp_…`.
- **Tenant-isolated** — a key is bound to one organization and every tool call
  runs through `withOrg()`, so Postgres Row-Level Security applies to all data
  the agent touches, exactly as in the app.
- **Scoped** — a key is `read_only` or `read_write`; read-only keys never see or
  invoke the write tools.
- **Automations fire** — records created via MCP dispatch the same triggers
  (`contact.created`, `deal.created`, `task.created`, …) as the UI.

Point a client at `${BETTER_AUTH_URL}/api/mcp` with the bearer token. See
[`docs/integrations/mcp.md`](./docs/integrations/mcp.md) for the tool list and
client setup.

---

## Quick start (local dev)

Requires Node ≥ 20, pnpm 11, and Docker (for Postgres).

```bash
pnpm install
cp .env.example .env                       # set BETTER_AUTH_SECRET: openssl rand -base64 32
docker compose up -d                       # PostgreSQL 17 on 127.0.0.1:5434
pnpm db:migrate                            # apply schema + Row-Level Security
pnpm db:seed                               # optional: demo org, pipeline, deals & automations
pnpm dev                                   # http://localhost:3000
```

Open http://localhost:3000, **sign up** to create your account. On the
self-hosted edition the first sign-in bootstraps a single organization
automatically.

> The seed creates demo **data** (companies, deals, workflows) but no
> sign-in-able demo user — create your own account via the signup screen.

---

## Configuration

All configuration is env-based (see [`.env.example`](./.env.example)).

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Runtime connection as the restricted `kundeo_app` role (RLS applies). |
| `DIRECT_URL` | Owner connection for migrations/seed (bypasses RLS). |
| `BETTER_AUTH_SECRET` | Auth signing secret — `openssl rand -base64 32`. |
| `BETTER_AUTH_URL` | Public base URL of the app. |
| `KUNDEO_EDITION` | `self-hosted` (default, single org) or `hosted` (org per signup). |
| `KUNDEO_EMAIL_PROVIDER` | `log` (default), `smtp`, or `m365`. |
| `KUNDEO_SMTP_*` | SMTP host/port/secure/user/pass/from (when provider = `smtp`). |
| `KUNDEO_M365_*` | Tenant/client id, secret, sender (when provider = `m365`). |
| `KUNDEO_WEBHOOK_ALLOWED_HOSTS` | Optional comma-separated webhook host allowlist. |
| `KUNDEO_DISABLE_AUTOMATION_TICKER` | Set to `1` to disable the schedule/delay sweeper. |
| `ENTRA_CLIENT_ID` | Entra app registration's Application (client) ID — enables Microsoft login. |
| `ENTRA_CLIENT_SECRET` | Client secret value from the app registration. |
| `ENTRA_TENANT_ID` | Your tenant GUID or verified domain — **never** `common`. |
| `KUNDEO_FREEFINANCE_BASE_URL` | FreeFinance API host (without `/api/2.0`) — enables the FreeFinance integration. |
| `KUNDEO_FREEFINANCE_CLIENT_ID` | OAuth client id (technical user) for the client-credentials grant. |
| `KUNDEO_FREEFINANCE_CLIENT_SECRET` | OAuth client secret for that technical user. |
| `KUNDEO_FREEFINANCE_MANDANT` | Numeric FreeFinance client id (Mandant) used in every API path. |
| `KUNDEO_ENCRYPTION_KEY` | AES-GCM key for encrypting per-org integration secrets at rest (hosted / DB-stored credentials). |

### Microsoft Entra ID login (optional)

Let users sign in with their Microsoft 365 / Entra ID work account. The button
appears on the login screen only when all three `ENTRA_*` variables are set;
otherwise Kundeo runs email/password only.

**Create an app registration** in the [Entra admin center](https://entra.microsoft.com)
→ **App registrations** → **New registration**:

1. **Supported account types:** single tenant.
2. **Redirect URI** (platform *Web*) — the callback URL is always your base URL
   plus the fixed path `/api/auth/callback/microsoft`:

   ```
   <BETTER_AUTH_URL>/api/auth/callback/microsoft
   ```

   Examples: `http://localhost:3000/api/auth/callback/microsoft` (dev),
   `https://crm.example.com/api/auth/callback/microsoft` (prod). Register one
   redirect URI per environment you run.
3. From **Overview**, copy **Application (client) ID** → `ENTRA_CLIENT_ID` and
   **Directory (tenant) ID** → `ENTRA_TENANT_ID`.
4. **Certificates & secrets** → **New client secret** → copy the *Value* (not the
   Secret ID) → `ENTRA_CLIENT_SECRET`. Secrets expire — note the expiry and
   rotate before then.

**Required API permissions** — Microsoft Graph, **Delegated** (not Application):

| Permission | Type | Why |
| --- | --- | --- |
| `openid` | Delegated | OIDC sign-in (issues the ID token). |
| `profile` | Delegated | User's name and basic profile claims. |
| `email` | Delegated | User's email — Kundeo's account key. |
| `offline_access` | Delegated | Refresh token so the session can be renewed without re-login. |
| `User.Read` | Delegated | Default Graph scope; read the signed-in user. Optional here because Kundeo disables the Graph profile-photo fetch, but it is the standard delegated grant and usually already present. |

These are delegated, user-consentable permissions — no Application permissions
and no directory-wide access are requested. Granting **admin consent** for the
tenant (App registration → **API permissions** → *Grant admin consent*) lets
users sign in without an individual consent prompt. `email`/`profile`/`openid`
are standard OIDC scopes; `User.Read` is added to new registrations by default.

> **Single-tenant lock:** `ENTRA_TENANT_ID` must be your tenant GUID or a
> verified domain. Setting it to `common` would let *any* Microsoft account
> worldwide sign in (and, on self-host, auto-create an org).

See [`docs/features/entra-login.md`](./docs/features/entra-login.md) for the full
design.

### FreeFinance integration (optional)

Turn CRM deals into FreeFinance offers and invoices, pull the finalized PDFs
back into Kundeo, and run Kundeo-owned dunning over them. The integration is off
until credentials are present.

- **Self-host (single org):** set the four `KUNDEO_FREEFINANCE_*` variables above.
  Env credentials win, so no database row is needed and the settings form renders
  them read-only.
- **Hosted (many orgs):** each org connects its own Mandant in
  **Einstellungen → Integrationen → FreeFinance**; the client secret is encrypted
  at rest with `KUNDEO_ENCRYPTION_KEY` (AES-GCM).

The `MANDANT` is the **numeric client id** (from `GET /clients`), not the OAuth
`client_id`. Full API notes, field mappings and the phased design live in
[`docs/integrations/freefinance.md`](./docs/integrations/freefinance.md).

---

## Project layout

Turborepo monorepo (pnpm workspaces).

| Path | What |
| --- | --- |
| `apps/web` | Next.js App Router app (`output: "standalone"` for Docker). |
| `packages/db` | Prisma schema, generated client, `withOrg()` tenant helper, seed, `rls.sql`. |
| `packages/auth` | Better Auth server (`.`) + browser client (`./client`). |
| `packages/tsconfig` | Shared TypeScript configs. |
| `deploy/` | Deployment assets: production Compose, systemd unit, tarball build, Postgres init (creates the restricted `kundeo_app` role). See [`deploy/README.md`](./deploy/README.md). |

### Scripts

```bash
pnpm dev          # run everything (web on :3000)
pnpm build        # production build
pnpm lint         # eslint
pnpm typecheck    # tsc across the monorepo
pnpm db:migrate   # prisma migrate dev
pnpm db:studio    # prisma studio
pnpm db:seed      # seed demo data
```

---

## Distribution & roadmap

Kundeo is **self-hosted first** and deliberately not coupled to any single
runtime. The app is built for a `standalone` Node output; the packaging around
it — see **[`deploy/`](./deploy/README.md)** for full instructions:

- ✅ Local dev via Docker Compose (Postgres) + `pnpm dev`.
- ✅ Production Docker image (GHCR) + app+db Compose file
  ([`deploy/docker-compose.yml`](./deploy/docker-compose.yml)).
- ✅ Native Linux: `standalone` build under systemd, shipped as a prebuilt
  release tarball ([`deploy/build-tarball.sh`](./deploy/build-tarball.sh),
  [`deploy/systemd/`](./deploy/systemd)).
- ✅ GitHub Actions to publish the image and tarball on tag/release
  ([`.github/workflows/release.yml`](./.github/workflows/release.yml)).

Both deployment paths apply migrations (schema + Row-Level Security) on start
and share one env-based setup. Quick start:

```bash
cd deploy && cp env.example .env   # fill in secrets
docker compose up -d               # app on :3000 + PostgreSQL
```


---

## License

[AGPL-3.0-only](./LICENSE). © Michel Roegl-Brunner and contributors.
