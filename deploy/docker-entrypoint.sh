#!/bin/sh
# Kundeo container entrypoint.
#
# Applies pending database migrations (schema + Row-Level Security) as the DB
# owner via DIRECT_URL, then hands off to the standalone server (which connects
# as the restricted kundeo_app role via DATABASE_URL). Set KUNDEO_SKIP_MIGRATE=1
# to run migrations out-of-band instead (e.g. a one-shot job before rollout).
set -e

SCHEMA="packages/db/prisma/schema.prisma"

if [ "${KUNDEO_SKIP_MIGRATE:-0}" = "1" ]; then
  echo "[kundeo] KUNDEO_SKIP_MIGRATE=1 — skipping 'prisma migrate deploy'."
else
  if [ -z "${DIRECT_URL:-}" ]; then
    echo "[kundeo] ERROR: DIRECT_URL is not set. Migrations run as the DB owner" >&2
    echo "[kundeo]        via DIRECT_URL; set it or pass KUNDEO_SKIP_MIGRATE=1." >&2
    exit 1
  fi
  echo "[kundeo] Applying database migrations (prisma migrate deploy)…"
  prisma migrate deploy --schema "$SCHEMA"
fi

echo "[kundeo] Starting server…"
exec "$@"
