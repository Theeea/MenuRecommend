-- CreateTable
CREATE TABLE "DailyRecommendQuota" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kstDate" VARCHAR(10) NOT NULL,
    "remaining" INTEGER NOT NULL DEFAULT 5,
    "adGranted" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyRecommendQuota_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyRecommendQuota_kstDate_idx" ON "DailyRecommendQuota"("kstDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyRecommendQuota_userId_kstDate_key" ON "DailyRecommendQuota"("userId", "kstDate");

-- AddForeignKey
ALTER TABLE "DailyRecommendQuota" ADD CONSTRAINT "DailyRecommendQuota_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
