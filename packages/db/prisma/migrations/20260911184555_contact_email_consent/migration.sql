-- AlterTable
ALTER TABLE "contact" ADD COLUMN     "emailConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emailConsentAt" TIMESTAMP(3);
