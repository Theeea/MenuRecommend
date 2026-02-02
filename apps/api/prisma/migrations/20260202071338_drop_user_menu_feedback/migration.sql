/*
  Warnings:

  - You are about to drop the `UserMenuFeedback` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "UserMenuFeedback" DROP CONSTRAINT "UserMenuFeedback_menuId_fkey";

-- DropTable
DROP TABLE "UserMenuFeedback";

-- DropEnum
DROP TYPE "UserMenuFeedbackType";
