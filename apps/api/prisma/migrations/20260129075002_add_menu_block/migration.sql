-- CreateTable
CREATE TABLE "UserMenuBlock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserMenuBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserMenuBlock_userId_createdAt_idx" ON "UserMenuBlock"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserMenuBlock_userId_menuId_key" ON "UserMenuBlock"("userId", "menuId");

-- AddForeignKey
ALTER TABLE "UserMenuBlock" ADD CONSTRAINT "UserMenuBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMenuBlock" ADD CONSTRAINT "UserMenuBlock_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;
