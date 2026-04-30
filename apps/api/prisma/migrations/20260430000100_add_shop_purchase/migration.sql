-- CreateEnum
CREATE TYPE "ShopItemStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('REQUESTED', 'SENT', 'CANCELLED');

-- CreateTable
CREATE TABLE "ShopItem" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT NOT NULL DEFAULT 'GIFTICON',
  "pricePoints" INTEGER NOT NULL,
  "imageUrl" TEXT,
  "status" "ShopItemStatus" NOT NULL DEFAULT 'ACTIVE',
  "stock" INTEGER,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ShopItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPurchase" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "shopItemId" TEXT NOT NULL,
  "points" INTEGER NOT NULL,
  "status" "PurchaseStatus" NOT NULL DEFAULT 'REQUESTED',
  "itemSnapshot" JSONB,
  "fulfillmentMeta" JSONB,
  "fulfilledAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShopItem_status_sortOrder_idx" ON "ShopItem"("status", "sortOrder");

-- CreateIndex
CREATE INDEX "ShopItem_category_status_idx" ON "ShopItem"("category", "status");

-- CreateIndex
CREATE INDEX "UserPurchase_userId_createdAt_idx" ON "UserPurchase"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UserPurchase_status_createdAt_idx" ON "UserPurchase"("status", "createdAt");

-- CreateIndex
CREATE INDEX "UserPurchase_shopItemId_createdAt_idx" ON "UserPurchase"("shopItemId", "createdAt");

-- AddForeignKey
ALTER TABLE "UserPurchase" ADD CONSTRAINT "UserPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPurchase" ADD CONSTRAINT "UserPurchase_shopItemId_fkey" FOREIGN KEY ("shopItemId") REFERENCES "ShopItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
