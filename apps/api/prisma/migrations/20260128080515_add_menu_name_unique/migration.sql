/*
  Warnings:

  - A unique constraint covering the columns `[name,cuisine]` on the table `Menu` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Menu_name_cuisine_key" ON "Menu"("name", "cuisine");
