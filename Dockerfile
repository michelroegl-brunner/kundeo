# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# Kundeo production image.
#
# Multi-stage build of the pnpm/turbo monorepo down to Next's `standalone`
# server bundle. The final image runs `prisma migrate deploy` on start (applying
# the schema + Row-Level Security as the DB owner via DIRECT_URL) and then boots
# the standalone server, which connects as the restricted `kundeo_app` role via
# DATABASE_URL. Build from the repo root:  docker build -t kundeo .
# ─────────────────────────────────────────────────────────────────────────────

ARG NODE_VERSION=22

# ─── Base: pnpm via corepack, openssl for Prisma's engines on musl ───────────
FROM node:${NODE_VERSION}-alpine AS base
# libc6-compat: some prebuilt native deps expect glibc symbols on musl.
# openssl: required by the Prisma query/schema engines.
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable
WORKDIR /app

# ─── Builder: install deps, generate the Prisma client, build standalone ─────
FROM base AS builder
# Manifests first so the install layer is cached across source-only changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
COPY packages/auth/package.json ./packages/auth/
COPY packages/tsconfig/package.json ./packages/tsconfig/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .

# Placeholder values so `next build` can compile without a live database or
# real secrets. None of these are baked into the runtime — the container is
# given real env at start. (DATABASE_URL/DIRECT_URL are read at request time,
# not build time; the auth secret is only consumed at runtime.)
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public" \
    DIRECT_URL="postgresql://build:build@localhost:5432/build?schema=public" \
    BETTER_AUTH_SECRET="build-time-placeholder-overridden-at-runtime" \
    BETTER_AUTH_URL="http://localhost:3000" \
    KUNDEO_ENCRYPTION_KEY="build-time-placeholder-overridden-at-runtime" \
    NEXT_TELEMETRY_DISABLED="1" \
    NODE_ENV="production"

# `turbo run build` runs db:generate (Prisma client) then next build.
RUN pnpm build

# ─── Runner: minimal image with just the standalone server + migrator ────────
FROM base AS runner
ENV NODE_ENV="production" \
    NEXT_TELEMETRY_DISABLED="1" \
    PORT="3000" \
    HOSTNAME="0.0.0.0"

# Prisma CLI for `migrate deploy` at container start. Pinned to the version
# resolved in the lockfile so the engine matches the generated client.
ARG PRISMA_VERSION=6.19.3
RUN npm install -g "prisma@${PRISMA_VERSION}" && npm cache clean --force

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
WORKDIR /app

# Standalone server bundle (includes the traced node_modules and the generated
# Prisma client). Static assets and public/ are NOT part of standalone — copy
# them in explicitly next to the server.
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

# Prisma schema + migrations, used by `migrate deploy` at start.
COPY --from=builder --chown=nextjs:nodejs /app/packages/db/prisma ./packages/db/prisma

COPY --chown=nextjs:nodejs deploy/docker-entrypoint.sh /usr/local/bin/kundeo-entrypoint
RUN chmod +x /usr/local/bin/kundeo-entrypoint

USER nextjs
EXPOSE 3000

# BusyBox wget (Alpine) has no --spider; -O /dev/null is the portable form.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/" || exit 1

ENTRYPOINT ["kundeo-entrypoint"]
CMD ["node", "apps/web/server.js"]
