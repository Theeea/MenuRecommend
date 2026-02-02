-- CreateEnum
CREATE TYPE "UserMenuFeedbackType" AS ENUM ('DISLIKED', 'LIKED');

-- CreateTable
CREATE TABLE "MealVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "challengeCode" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserMenuFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "type" "UserMenuFeedbackType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserMenuFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MealVerification_userId_createdAt_idx" ON "MealVerification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UserMenuFeedback_userId_type_createdAt_idx" ON "UserMenuFeedback"("userId", "type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserMenuFeedback_userId_menuId_key" ON "UserMenuFeedback"("userId", "menuId");

-- AddForeignKey
ALTER TABLE "UserMenuFeedback" ADD CONSTRAINT "UserMenuFeedback_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;
