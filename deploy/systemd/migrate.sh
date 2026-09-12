#!/bin/sh
# Apply pending Kundeo migrations for a native install, using the Prisma CLI
# bundled in the release tarball (./migrator). Invoked by kundeo.service as
# ExecStartPre; safe to run by hand too. Set KUNDEO_SKIP_MIGRATE=1 to skip.
set -e

# Resolve the install root (this script lives in <root>/bin/).
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ "${KUNDEO_SKIP_MIGRATE:-0}" = "1" ]; then
  echo "[kundeo] KUNDEO_SKIP_MIGRATE=1 — skipping migrations."
  exit 0
fi

if [ -z "${DIRECT_URL:-}" ]; then
  echo "[kundeo] ERROR: DIRECT_URL is not set (migrations run as the DB owner)." >&2
  exit 1
fi

echo "[kundeo] Applying database migrations (prisma migrate deploy)…"
exec ./migrator/node_modules/.bin/prisma migrate deploy \
  --schema packages/db/prisma/schema.prisma
