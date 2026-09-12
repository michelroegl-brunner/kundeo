-- CreateTable
CREATE TABLE "email_template" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_template_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_template_organizationId_updatedAt_idx" ON "email_template"("organizationId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "email_template_organizationId_name_key" ON "email_template"("organizationId", "name");

-- AddForeignKey
ALTER TABLE "email_template" ADD CONSTRAINT "email_template_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Row-Level Security ──────────────────────────────────────────────────────
-- Mirrors prisma/rls.sql. email_template is directly tenant-scoped on its own
-- "organizationId". app_current_org_id() is created by the initial rls
-- migration. Table owner (migrations/seed) still bypasses RLS.
ALTER TABLE "email_template" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "email_template";
CREATE POLICY tenant_isolation ON "email_template"
  USING ("organizationId" = app_current_org_id())
  WITH CHECK ("organizationId" = app_current_org_id());
