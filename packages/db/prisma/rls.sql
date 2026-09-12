-- Row-Level Security for Kundeo multi-tenancy.
--
-- Apply this AFTER the initial Prisma migration creates the tables. Turn it
-- into a real migration with:
--   pnpm --filter @kundeo/db exec prisma migrate dev --create-only --name rls
-- then paste this into the generated migration.sql and run migrate dev again.
--
-- The application connects as `kundeo_app` (a role that is subject to RLS) and
-- calls `set_config('app.current_org_id', <org>, true)` at the start of each
-- transaction (see withOrg() in src/index.ts). Every tenant-scoped table then
-- only exposes rows for the active organization. Migrations and the seed run as
-- the table owner, which bypasses RLS — so we do NOT use FORCE ROW LEVEL
-- SECURITY here.

-- Helper: current org from the transaction-local setting (NULL if unset).
CREATE OR REPLACE FUNCTION app_current_org_id() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.current_org_id', true), '') $$;

-- Macro-style block: enable RLS + a single policy per tenant table.
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'company', 'contact', 'pipeline', 'deal', 'activity', 'tag',
    'workflow', 'workflow_run', 'email_template',
    'org_integration', 'external_ref', 'product', 'document'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING ("organizationId" = app_current_org_id())
         WITH CHECK ("organizationId" = app_current_org_id())',
      t
    );
  END LOOP;
END $$;

-- Tables scoped indirectly (via a parent) get policies keyed on the parent.
ALTER TABLE "stage" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "stage";
CREATE POLICY tenant_isolation ON "stage"
  USING (EXISTS (SELECT 1 FROM "pipeline" p
                 WHERE p.id = "stage"."pipelineId"
                   AND p."organizationId" = app_current_org_id()));

ALTER TABLE "contact_tag" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "contact_tag";
CREATE POLICY tenant_isolation ON "contact_tag"
  USING (EXISTS (SELECT 1 FROM "contact" c
                 WHERE c.id = "contact_tag"."contactId"
                   AND c."organizationId" = app_current_org_id()));

ALTER TABLE "workflow_step" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "workflow_step";
CREATE POLICY tenant_isolation ON "workflow_step"
  USING (EXISTS (SELECT 1 FROM "workflow" w
                 WHERE w.id = "workflow_step"."workflowId"
                   AND w."organizationId" = app_current_org_id()));

ALTER TABLE "workflow_run_step" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "workflow_run_step";
CREATE POLICY tenant_isolation ON "workflow_run_step"
  USING (EXISTS (SELECT 1 FROM "workflow_run" r
                 WHERE r.id = "workflow_run_step"."runId"
                   AND r."organizationId" = app_current_org_id()));

ALTER TABLE "document_line" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "document_line";
CREATE POLICY tenant_isolation ON "document_line"
  USING (EXISTS (SELECT 1 FROM "document" d
                 WHERE d.id = "document_line"."documentId"
                   AND d."organizationId" = app_current_org_id()));
