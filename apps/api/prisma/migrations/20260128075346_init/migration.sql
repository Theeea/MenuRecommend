-- CreateEnum
CREATE TYPE "Cuisine" AS ENUM ('KOREAN', 'CHINESE', 'JAPANESE', 'WESTERN', 'ASIAN', 'SNACK', 'FASTFOOD', 'SALAD', 'DESSERT', 'ETC');

-- CreateEnum
CREATE TYPE "DishType" AS ENUM ('RICE', 'NOODLE', 'SOUP', 'STEW', 'GRILL', 'STIR_FRY', 'FRIED', 'SALAD', 'BREAD', 'DESSERT', 'OTHER');

-- CreateEnum
CREATE TYPE "IngredientRole" AS ENUM ('MAIN', 'SUB', 'OPTIONAL');

-- CreateEnum
CREATE TYPE "Removable" AS ENUM ('YES', 'NO', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RecommendStatus" AS ENUM ('RECOMMENDED', 'ACCEPTED', 'PROOF_SUBMITTED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProofResult" AS ENUM ('PENDING', 'PASS', 'HOLD', 'FAIL');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER', 'REVIEWER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Menu" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cuisine" "Cuisine" NOT NULL,
    "dishType" "DishType",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuIngredient" (
    "menuId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "role" "IngredientRole" NOT NULL,
    "removable" "Removable" NOT NULL DEFAULT 'UNKNOWN',
    "weight" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "MenuIngredient_pkey" PRIMARY KEY ("menuId","ingredientId")
);

-- CreateTable
CREATE TABLE "UserDislikedIngredient" (
    "userId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDislikedIngredient_pkey" PRIMARY KEY ("userId","ingredientId")
);

-- CreateTable
CREATE TABLE "RecommendSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "status" "RecommendStatus" NOT NULL DEFAULT 'RECOMMENDED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "RecommendSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proof" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "aiScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "aiResult" "ProofResult" NOT NULL DEFAULT 'PENDING',
    "aiModel" TEXT,
    "aiMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByAdminId" TEXT,

    CONSTRAINT "Proof_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "proofId" TEXT,

    CONSTRAINT "PointLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'REVIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Ingredient_name_key" ON "Ingredient"("name");

-- CreateIndex
CREATE INDEX "Menu_cuisine_idx" ON "Menu"("cuisine");

-- CreateIndex
CREATE INDEX "Menu_cuisine_dishType_idx" ON "Menu"("cuisine", "dishType");

-- CreateIndex
CREATE INDEX "MenuIngredient_ingredientId_idx" ON "MenuIngredient"("ingredientId");

-- CreateIndex
CREATE INDEX "UserDislikedIngredient_ingredientId_idx" ON "UserDislikedIngredient"("ingredientId");

-- CreateIndex
CREATE INDEX "RecommendSession_userId_createdAt_idx" ON "RecommendSession"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RecommendSession_menuId_createdAt_idx" ON "RecommendSession"("menuId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Proof_sessionId_key" ON "Proof"("sessionId");

-- CreateIndex
CREATE INDEX "Proof_aiResult_createdAt_idx" ON "Proof"("aiResult", "createdAt");

-- CreateIndex
CREATE INDEX "PointLedger_userId_createdAt_idx" ON "PointLedger"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuIngredient" ADD CONSTRAINT "MenuIngredient_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuIngredient" ADD CONSTRAINT "MenuIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDislikedIngredient" ADD CONSTRAINT "UserDislikedIngredient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDislikedIngredient" ADD CONSTRAINT "UserDislikedIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendSession" ADD CONSTRAINT "RecommendSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendSession" ADD CONSTRAINT "RecommendSession_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proof" ADD CONSTRAINT "Proof_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proof" ADD CONSTRAINT "Proof_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RecommendSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointLedger" ADD CONSTRAINT "PointLedger_proofId_fkey" FOREIGN KEY ("proofId") REFERENCES "Proof"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointLedger" ADD CONSTRAINT "PointLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
