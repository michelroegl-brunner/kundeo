# Kundeo

Open-source CRM for the **DACH market** — self-hostable, with a planned hosted
version.

> Status: early scaffold. Not yet usable as a CRM.

## Stack

Next.js (App Router) · React 19 · Prisma · PostgreSQL · Tailwind v4 ·
Better Auth · Turborepo · pnpm.

## Getting started

```bash
pnpm install
cp .env.example .env            # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
docker compose up -d            # local Postgres on :5432
pnpm db:migrate                 # create tables
# apply Row-Level Security once (see packages/db/prisma/rls.sql)
pnpm db:seed                    # optional demo data
pnpm dev                        # http://localhost:3000
```

## Monorepo

| Path                | What                                               |
| ------------------- | -------------------------------------------------- |
| `apps/web`          | Next.js application                                |
| `packages/db`       | Prisma schema, client, tenant helper, seed         |
| `packages/auth`     | Better Auth (server + client)                      |
| `packages/tsconfig` | Shared TypeScript configs                          |

## Multi-tenancy

Tenant = a Better Auth **organization**. Every tenant row carries
`organizationId`, and isolation is enforced by **Postgres Row-Level Security**.
Data access goes through `scoped()` / `withOrg()`, which set the active org for
the transaction. See `CLAUDE.md` for the rules.

## License

[AGPL-3.0-only](./LICENSE). © Michel Roegl-Brunner and contributors.
