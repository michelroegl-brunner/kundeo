-- AlterTable
ALTER TABLE "document" ADD COLUMN     "dunningLevel" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dunningPausedUntil" TIMESTAMP(3),
ADD COLUMN     "lastDunnedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "dunning_policy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "graceDays" INTEGER NOT NULL DEFAULT 3,
    "intervalDays" INTEGER NOT NULL DEFAULT 7,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dunning_policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunning_level" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "feeCents" INTEGER NOT NULL DEFAULT 0,
    "interestBps" INTEGER NOT NULL DEFAULT 0,
    "emailTemplateId" TEXT,

    CONSTRAINT "dunning_level_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunning_run" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "feeCents" INTEGER NOT NULL DEFAULT 0,
    "interestCents" INTEGER NOT NULL DEFAULT 0,
    "openCents" INTEGER NOT NULL DEFAULT 0,
    "emailStatus" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunning_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dunning_policy_organizationId_key" ON "dunning_policy"("organizationId");

-- CreateIndex
CREATE INDEX "dunning_level_policyId_idx" ON "dunning_level"("policyId");

-- CreateIndex
CREATE UNIQUE INDEX "dunning_level_policyId_level_key" ON "dunning_level"("policyId", "level");

-- CreateIndex
CREATE INDEX "dunning_run_organizationId_documentId_idx" ON "dunning_run"("organizationId", "documentId");

-- CreateIndex
CREATE INDEX "document_organizationId_kind_paymentStatus_dunningLevel_idx" ON "document"("organizationId", "kind", "paymentStatus", "dunningLevel");

-- AddForeignKey
ALTER TABLE "dunning_policy" ADD CONSTRAINT "dunning_policy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dunning_level" ADD CONSTRAINT "dunning_level_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "dunning_policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dunning_run" ADD CONSTRAINT "dunning_run_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dunning_run" ADD CONSTRAINT "dunning_run_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────────────────────────────────────────────────────────────────────────
-- Row-Level Security for the Mahnwesen tables. Mirrors prisma/rls.sql: the
-- standard org-scoped policy for tables carrying organizationId, and a
-- parent-keyed policy for dunning_level (scoped via its dunning_policy).
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
  dun_tables text[] := ARRAY['dunning_policy', 'dunning_run'];
BEGIN
  FOREACH t IN ARRAY dun_tables LOOP
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

ALTER TABLE "dunning_level" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "dunning_level";
CREATE POLICY tenant_isolation ON "dunning_level"
  USING (EXISTS (SELECT 1 FROM "dunning_policy" p
                 WHERE p.id = "dunning_level"."policyId"
                   AND p."organizationId" = app_current_org_id()));
