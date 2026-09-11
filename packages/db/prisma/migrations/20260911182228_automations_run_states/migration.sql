-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WorkflowRunStatus" ADD VALUE 'RUNNING';
ALTER TYPE "WorkflowRunStatus" ADD VALUE 'WAITING';

-- AlterTable
ALTER TABLE "workflow_run" ADD COLUMN     "resumeAt" TIMESTAMP(3),
ADD COLUMN     "resumeStepId" TEXT;

-- CreateIndex
CREATE INDEX "workflow_run_status_resumeAt_idx" ON "workflow_run"("status", "resumeAt");
