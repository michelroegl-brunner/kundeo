# Kundeo — project guide

Open-source CRM for the DACH market. Self-hostable (AGPLv3), with a planned
hosted version. Stack: Next.js (App Router) · React 19 · Prisma · PostgreSQL ·
Tailwind v4 · Better Auth. Turborepo monorepo, pnpm.

## Layout

- `apps/web` — Next.js app (App Router, `output: "standalone"` for Docker).
- `packages/db` — Prisma schema, generated client, `withOrg()` tenant helper, seed.
- `packages/auth` — Better Auth server (`.`) + browser client (`./client`).
- `packages/tsconfig` — shared TS configs (`base` / `nextjs` / `library`).

## Multi-tenancy (read before touching data access)

- Tenant boundary = Better Auth **organization**. Active org lives on the
  session as `activeOrganizationId`.
- Every tenant-owned row has `organizationId`. Isolation is enforced by
  **Postgres Row-Level Security** (`packages/db/prisma/rls.sql`), not just by
  `where` clauses.
- **Always** access CRM data through `scoped()` (`apps/web/lib/session.ts`) or
  `withOrg()` (`@kundeo/db`). These set `app.current_org_id` for the
  transaction so RLS applies. Never query tenant tables on the bare `prisma`
  client from a request handler.
- Self-host = one organization; hosted = many orgs per database.

## Conventions

- Money is stored as integer minor units (`amountCents`), never floats.
- DACH specifics belong in the domain: `vatId` (USt-IdNr./UID), `salutation`,
  formal `title`, country in `{DE, AT, CH}`, `EUR`/`CHF`.
- UI copy is German; code, comments, identifiers are English.
- Server Components by default; `"use client"` only where interactivity needs it.

## Commands

- `pnpm dev` — run everything (web on :3000).
- `docker compose up -d` — local Postgres.
- `pnpm db:migrate` / `pnpm db:studio` / `pnpm db:seed`.
- `pnpm typecheck` / `pnpm lint` / `pnpm build`.

## Tooling / skills available in this environment

- **Prisma** plugin (MCP) — schema/migration help. **Playwright** plugin (MCP)
  — E2E once flows exist.
- `feature-dev`, `code-review`, `security-review`, `commit`/`commit-push-pr`
  skills fit this stack. Prefer `code-review` before merging and
  `security-review` for anything touching auth or the RLS boundary.
