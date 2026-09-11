-- CreateEnum
CREATE TYPE "DealValueMode" AS ENUM ('FIXED', 'EFFORT');

-- CreateEnum
CREATE TYPE "EffortPeriod" AS ENUM ('WEEKLY', 'MONTHLY', 'ANNUAL');

-- AlterTable
ALTER TABLE "deal" ADD COLUMN     "effortPeriod" "EffortPeriod",
ADD COLUMN     "hourlyRateCents" INTEGER,
ADD COLUMN     "hoursPerWeek" DECIMAL(6,2),
ADD COLUMN     "valueMode" "DealValueMode" NOT NULL DEFAULT 'FIXED';
