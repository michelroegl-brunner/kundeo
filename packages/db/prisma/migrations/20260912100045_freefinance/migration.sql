-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('OFFER', 'INVOICE');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'STAGING', 'FINALIZED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('OPEN', 'PARTIAL', 'PAID');

-- CreateEnum
CREATE TYPE "FreeFinanceSyncJobKind" AS ENUM ('CUSTOMER_SYNC', 'INVOICE_CREATE');

-- CreateEnum
CREATE TYPE "FreeFinanceSyncJobStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "org_integration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "mandant" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_ref" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "externalNumber" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_ref_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sku" TEXT,
    "unitPriceCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "vatRate" INTEGER NOT NULL DEFAULT 20,
    "unit" TEXT,
    "account" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "companyId" TEXT,
    "contactId" TEXT,
    "dealId" TEXT,
    "sourceOfferId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "netCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "discountValue" DECIMAL(12,4),
    "discountMode" TEXT,
    "issueDate" TIMESTAMP(3),
    "expirationDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'OPEN',
    "paidCents" INTEGER NOT NULL DEFAULT 0,
    "externalNumber" TEXT,
    "eInvoice" TEXT NOT NULL DEFAULT 'NONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_line" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'ITEM',
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "itemNumber" TEXT,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit" TEXT,
    "unitPriceCents" INTEGER NOT NULL,
    "discountValue" DECIMAL(12,4),
    "discountMode" TEXT,
    "account" TEXT,
    "vatRate" INTEGER NOT NULL,
    "netCents" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,

    CONSTRAINT "document_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "freefinance_sync_job" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "FreeFinanceSyncJobKind" NOT NULL,
    "status" "FreeFinanceSyncJobStatus" NOT NULL DEFAULT 'PENDING',
    "companyId" TEXT,
    "dealId" TEXT,
    "documentId" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "runId" TEXT,
    "runStepId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "freefinance_sync_job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "org_integration_organizationId_idx" ON "org_integration"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "org_integration_organizationId_provider_key" ON "org_integration"("organizationId", "provider");

-- CreateIndex
CREATE INDEX "external_ref_organizationId_provider_externalId_idx" ON "external_ref"("organizationId", "provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "external_ref_organizationId_provider_entityType_entityId_key" ON "external_ref"("organizationId", "provider", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "product_organizationId_idx" ON "product"("organizationId");

-- CreateIndex
CREATE INDEX "product_organizationId_active_idx" ON "product"("organizationId", "active");

-- CreateIndex
CREATE INDEX "document_organizationId_kind_status_idx" ON "document"("organizationId", "kind", "status");

-- CreateIndex
CREATE INDEX "document_line_documentId_idx" ON "document_line"("documentId");

-- CreateIndex
CREATE INDEX "freefinance_sync_job_organizationId_idx" ON "freefinance_sync_job"("organizationId");

-- CreateIndex
CREATE INDEX "freefinance_sync_job_status_runAt_idx" ON "freefinance_sync_job"("status", "runAt");

-- AddForeignKey
ALTER TABLE "org_integration" ADD CONSTRAINT "org_integration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_ref" ADD CONSTRAINT "external_ref_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_line" ADD CONSTRAINT "document_line_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freefinance_sync_job" ADD CONSTRAINT "freefinance_sync_job_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────────────────────────────────────────────────────────────────────────
-- Row-Level Security for the FreeFinance tables. Mirrors prisma/rls.sql: the
-- standard org-scoped policy for tables carrying organizationId, and a
-- parent-keyed policy for document_line (scoped via its document).
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
  ff_tables text[] := ARRAY[
    'org_integration', 'external_ref', 'product', 'document', 'freefinance_sync_job'
  ];
BEGIN
  FOREACH t IN ARRAY ff_tables LOOP
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

ALTER TABLE "document_line" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "document_line";
CREATE POLICY tenant_isolation ON "document_line"
  USING (EXISTS (SELECT 1 FROM "document" d
                 WHERE d.id = "document_line"."documentId"
                   AND d."organizationId" = app_current_org_id()));
