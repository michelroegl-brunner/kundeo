-- AlterTable
ALTER TABLE "mcp_access_token" ADD COLUMN     "familyId" TEXT;

-- CreateIndex
CREATE INDEX "mcp_access_token_familyId_idx" ON "mcp_access_token"("familyId");
