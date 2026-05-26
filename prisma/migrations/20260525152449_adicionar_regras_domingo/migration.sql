/*
  Warnings:

  - You are about to drop the column `trabalhaDomingoAlt` on the `horarios` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "horarios" DROP COLUMN "trabalhaDomingoAlt",
ADD COLUMN     "trabalhaDomingo" BOOLEAN NOT NULL DEFAULT false;
