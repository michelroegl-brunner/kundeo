# Deploying Kundeo

Kundeo is **self-hosted first**. Two supported paths, both sharing one setup
flow (env-based config, migrations applied on start):

- **Docker Compose** — app image (GHCR) + PostgreSQL.
- **Native Linux** — the prebuilt release tarball under systemd, on plain Node.

In both, migrations (schema + Row-Level Security) run automatically on start as
the DB **owner** via `DIRECT_URL`; the app then serves as the restricted
`kundeo_app` role via `DATABASE_URL`. Set `KUNDEO_SKIP_MIGRATE=1` to apply
migrations out-of-band instead.

---

## Option A — Docker Compose

```bash
cd deploy
cp env.example .env          # fill in POSTGRES_PASSWORD, BETTER_AUTH_SECRET,
                             # KUNDEO_ENCRYPTION_KEY, BETTER_AUTH_URL
docker compose up -d
```

The app comes up on `:3000` (override with `KUNDEO_PORT`). Postgres is
internal-only; `postgres/init.sql` creates the `kundeo_app` role on first boot.

Pin a released image in production instead of `:latest`:

```bash
KUNDEO_IMAGE=ghcr.io/michelroegl-brunner/kundeo:0.1.0 docker compose up -d
```

Build the image locally (from the repo root) if you're not using GHCR:

```bash
docker build -t ghcr.io/michelroegl-brunner/kundeo:dev .
```

> The app password in `DATABASE_URL` (`kundeo_app`) matches
> `postgres/init.sql`. To change it, update both. The DB owner password is
> `POSTGRES_PASSWORD` from `.env` and is used only for migrations.

---

## Option B — Native Linux (systemd + tarball)

No build step on the server — the release tarball ships the standalone Next
server, static assets, the Prisma schema + migrations, and a bundled Prisma CLI
for migrations. **Requires Node ≥ 20 and a reachable PostgreSQL.**

1. Grab `kundeo-<version>-linux.tar.gz` from the
   [GitHub Release](https://github.com/michelroegl-brunner/kundeo/releases)
   (or build it: `deploy/build-tarball.sh`).

2. Provision the database role once (as the DB superuser/owner) using
   `deploy/postgres/init.sql`, then extract and configure:

   ```bash
   sudo useradd --system --home /opt/kundeo --shell /usr/sbin/nologin kundeo
   sudo mkdir -p /opt/kundeo
   sudo tar -xzf kundeo-<version>-linux.tar.gz --strip-components=1 -C /opt/kundeo
   sudo cp /opt/kundeo/kundeo.env.example /opt/kundeo/kundeo.env
   sudo $EDITOR /opt/kundeo/kundeo.env          # DATABASE_URL, DIRECT_URL, secrets
   sudo chown -R kundeo:kundeo /opt/kundeo
   ```

3. Install and start the service:

   ```bash
   sudo cp /opt/kundeo/kundeo.service /etc/systemd/system/kundeo.service
   sudo systemctl daemon-reload
   sudo systemctl enable --now kundeo
   sudo systemctl status kundeo
   ```

`ExecStartPre` runs `bin/migrate.sh` (migrations) before the server starts.
Put a TLS-terminating reverse proxy (nginx/Caddy) in front and point
`BETTER_AUTH_URL` at the public URL.

---

## Releases (CI)

`.github/workflows/release.yml` runs on a `v*` tag or a published release:

- builds and pushes the multi-arch image to `ghcr.io/michelroegl-brunner/kundeo`,
- builds the native tarball and attaches it to the release.

Cut a release:

```bash
git tag v0.1.0 && git push origin v0.1.0
```
