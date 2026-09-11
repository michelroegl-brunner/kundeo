-- Runs once on first boot of the Postgres container.
-- Creates the limited runtime role the app connects as. The `kundeo` superuser
-- owns the tables and runs migrations; `kundeo_app` is subject to Row-Level
-- Security (table owners bypass RLS, so the app must NOT connect as the owner).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kundeo_app') THEN
    CREATE ROLE kundeo_app WITH LOGIN PASSWORD 'kundeo_app' NOBYPASSRLS;
  END IF;
END $$;

GRANT CONNECT ON DATABASE kundeo TO kundeo_app;
GRANT USAGE ON SCHEMA public TO kundeo_app;

-- Privileges on existing and future tables/sequences. The RLS migration adds
-- the policies that then constrain what kundeo_app can actually see.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kundeo_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kundeo_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kundeo_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO kundeo_app;
