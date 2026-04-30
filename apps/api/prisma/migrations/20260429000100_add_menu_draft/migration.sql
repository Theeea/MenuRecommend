-- CreateTable
CREATE TABLE "MenuDraft" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "cuisine" "Cuisine" NOT NULL,
    "dishType" "DishType",
    "ingredients" JSONB NOT NULL,
    "description" TEXT,
    "tags" JSONB,
    "source" TEXT NOT NULL DEFAULT 'AI',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "aiMeta" JSONB,
    "menuId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MenuDraft_status_createdAt_idx" ON "MenuDraft"("status", "createdAt");

-- CreateIndex
CREATE INDEX "MenuDraft_cuisine_status_idx" ON "MenuDraft"("cuisine", "status");

-- CreateIndex
CREATE INDEX "MenuDraft_normalizedName_cuisine_idx" ON "MenuDraft"("normalizedName", "cuisine");
