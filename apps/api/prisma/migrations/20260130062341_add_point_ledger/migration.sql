/*
  Warnings:

  - You are about to drop the column `delta` on the `PointLedger` table. All the data in the column will be lost.
  - You are about to drop the column `reason` on the `PointLedger` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[dedupeKey]` on the table `PointLedger` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `balanceAfter` to the `PointLedger` table without a default value. This is not possible if the table is not empty.
  - Added the required column `kind` to the `PointLedger` table without a default value. This is not possible if the table is not empty.
  - Added the required column `points` to the `PointLedger` table without a default value. This is not possible if the table is not empty.
  - Added the required column `source` to the `PointLedger` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PointKind" AS ENUM ('EARN', 'SPEND', 'ADJUST');

-- CreateEnum
CREATE TYPE "PointSource" AS ENUM ('PROOF', 'ADMIN', 'REDEEM', 'SYSTEM');

-- AlterTable
ALTER TABLE "PointLedger" DROP COLUMN "delta",
DROP COLUMN "reason",
ADD COLUMN     "balanceAfter" INTEGER NOT NULL,
ADD COLUMN     "dedupeKey" TEXT,
ADD COLUMN     "kind" "PointKind" NOT NULL,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "points" INTEGER NOT NULL,
ADD COLUMN     "reviewedByAdminId" TEXT,
ADD COLUMN     "source" "PointSource" NOT NULL,
ADD COLUMN     "sourceId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pointBalance" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "PointLedger_dedupeKey_key" ON "PointLedger"("dedupeKey");

-- CreateIndex
CREATE INDEX "PointLedger_source_sourceId_idx" ON "PointLedger"("source", "sourceId");

-- AddForeignKey
ALTER TABLE "PointLedger" ADD CONSTRAINT "PointLedger_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
