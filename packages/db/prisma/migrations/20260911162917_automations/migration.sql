-- CreateEnum
CREATE TYPE "WorkflowStepKind" AS ENUM ('TRIGGER', 'ACTION', 'DELAY', 'BRANCH', 'FILTER');

-- CreateEnum
CREATE TYPE "BranchPath" AS ENUM ('YES', 'NO');

-- CreateEnum
CREATE TYPE "WorkflowRunStatus" AS ENUM ('OK', 'ERROR', 'SKIPPED', 'TEST');

-- CreateEnum
CREATE TYPE "WorkflowRunStepStatus" AS ENUM ('OK', 'ERROR', 'SKIPPED');

-- CreateTable
CREATE TABLE "workflow" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_step" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "kind" "WorkflowStepKind" NOT NULL,
    "type" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "parentStepId" TEXT,
    "branchPath" "BranchPath",
    "config" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "workflow_step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_run" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "WorkflowRunStatus" NOT NULL,
    "triggeredByUserId" TEXT,
    "recordType" TEXT,
    "recordId" TEXT,
    "durationMs" INTEGER,

    CONSTRAINT "workflow_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_run_step" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "status" "WorkflowRunStepStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMs" INTEGER,
    "message" TEXT,
    "errorCode" TEXT,

    CONSTRAINT "workflow_run_step_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workflow_organizationId_idx" ON "workflow"("organizationId");

-- CreateIndex
CREATE INDEX "workflow_step_workflowId_idx" ON "workflow_step"("workflowId");

-- CreateIndex
CREATE INDEX "workflow_step_workflowId_parentStepId_order_idx" ON "workflow_step"("workflowId", "parentStepId", "order");

-- CreateIndex
CREATE INDEX "workflow_run_organizationId_idx" ON "workflow_run"("organizationId");

-- CreateIndex
CREATE INDEX "workflow_run_organizationId_workflowId_idx" ON "workflow_run"("organizationId", "workflowId");

-- CreateIndex
CREATE INDEX "workflow_run_workflowId_startedAt_idx" ON "workflow_run"("workflowId", "startedAt");

-- CreateIndex
CREATE INDEX "workflow_run_step_runId_idx" ON "workflow_run_step"("runId");

-- AddForeignKey
ALTER TABLE "workflow" ADD CONSTRAINT "workflow_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_step" ADD CONSTRAINT "workflow_step_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_step" ADD CONSTRAINT "workflow_step_parentStepId_fkey" FOREIGN KEY ("parentStepId") REFERENCES "workflow_step"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_run_step" ADD CONSTRAINT "workflow_run_step_runId_fkey" FOREIGN KEY ("runId") REFERENCES "workflow_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Row-Level Security ──────────────────────────────────────────────────────
-- Mirrors prisma/rls.sql. Directly tenant-scoped tables (workflow, workflow_run)
-- filter on their own "organizationId"; the child tables (workflow_step,
-- workflow_run_step) filter via their parent. app_current_org_id() is created by
-- the initial rls migration. Table owner (migrations/seed) still bypasses RLS.

-- Directly tenant-scoped tables.
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY['workflow', 'workflow_run'];
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

-- Child tables scoped via their parent.
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
