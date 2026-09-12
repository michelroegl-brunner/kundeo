#!/usr/bin/env bash
# Build a self-contained native release tarball for Kundeo.
#
# The tarball extracts to a directory that runs directly on Node (>= 20) with
# no build step on the server: Next's standalone server, static assets, the
# Prisma schema + migrations, and a bundled Prisma CLI (./migrator) for
# `migrate deploy`. See deploy/systemd/ for the unit that runs it.
#
# Usage:
#   deploy/build-tarball.sh [VERSION]
#
# Env:
#   SKIP_BUILD=1   reuse an existing apps/web/.next build instead of rebuilding
#   OUT_DIR=path   where to write the tarball (default: dist-release/)
#   PRISMA_VERSION Prisma CLI version to bundle (default: 6.19.3)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="${1:-$(git describe --tags --always --dirty 2>/dev/null || echo dev)}"
OUT_DIR="${OUT_DIR:-$ROOT/dist-release}"
PRISMA_VERSION="${PRISMA_VERSION:-6.19.3}"
NAME="kundeo-${VERSION}-linux"
STAGE="$OUT_DIR/$NAME"

echo "==> Building Kundeo release tarball: $NAME"

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  echo "==> Installing dependencies (frozen lockfile)…"
  pnpm install --frozen-lockfile
  echo "==> Building (turbo: db:generate + next build --standalone)…"
  pnpm build
fi

STANDALONE="$ROOT/apps/web/.next/standalone"
if [ ! -f "$STANDALONE/apps/web/server.js" ]; then
  echo "ERROR: standalone build not found at $STANDALONE." >&2
  echo "       Run without SKIP_BUILD=1, or run 'pnpm build' first." >&2
  exit 1
fi

echo "==> Assembling staging dir: $STAGE"
rm -rf "$STAGE"
mkdir -p "$STAGE"

# 1) Standalone server (root files + traced node_modules + workspace packages).
cp -R "$STANDALONE/." "$STAGE/"
# 2) Static assets and public/ (not included in standalone).
mkdir -p "$STAGE/apps/web/.next"
cp -R "$ROOT/apps/web/.next/static" "$STAGE/apps/web/.next/static"
if [ -d "$ROOT/apps/web/public" ]; then
  cp -R "$ROOT/apps/web/public" "$STAGE/apps/web/public"
fi
# 3) Prisma schema + migrations for `migrate deploy`.
mkdir -p "$STAGE/packages/db"
cp -R "$ROOT/packages/db/prisma" "$STAGE/packages/db/prisma"

# 4) Bundle a Prisma CLI so the server needs no network at deploy time.
#    The staging root carries a package.json (copied from the standalone
#    bundle), so give the migrator its own package.json — otherwise npm walks up
#    and installs into the app's node_modules instead of ./migrator.
echo "==> Bundling Prisma CLI $PRISMA_VERSION into ./migrator…"
mkdir -p "$STAGE/migrator"
cat > "$STAGE/migrator/package.json" <<EOF
{ "name": "kundeo-migrator", "version": "0.0.0", "private": true }
EOF
( cd "$STAGE/migrator" && npm install --no-package-lock --loglevel=error "prisma@${PRISMA_VERSION}" )

# 5) Operator files.
mkdir -p "$STAGE/bin"
cp "$ROOT/deploy/systemd/migrate.sh" "$STAGE/bin/migrate.sh"
chmod +x "$STAGE/bin/migrate.sh"
cp "$ROOT/deploy/systemd/kundeo.service" "$STAGE/kundeo.service"
cp "$ROOT/deploy/systemd/kundeo.env.example" "$STAGE/kundeo.env.example"
cp "$ROOT/deploy/README.md" "$STAGE/README.md" 2>/dev/null || true

echo "==> Creating tarball…"
mkdir -p "$OUT_DIR"
tar -C "$OUT_DIR" -czf "$OUT_DIR/$NAME.tar.gz" "$NAME"
rm -rf "$STAGE"

echo "==> Done: $OUT_DIR/$NAME.tar.gz"
