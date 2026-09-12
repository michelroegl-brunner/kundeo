-- CreateTable
CREATE TABLE "mcp_api_key" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'read_write',
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_api_key_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mcp_api_key_keyHash_key" ON "mcp_api_key"("keyHash");

-- CreateIndex
CREATE INDEX "mcp_api_key_organizationId_idx" ON "mcp_api_key"("organizationId");

-- AddForeignKey
ALTER TABLE "mcp_api_key" ADD CONSTRAINT "mcp_api_key_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
