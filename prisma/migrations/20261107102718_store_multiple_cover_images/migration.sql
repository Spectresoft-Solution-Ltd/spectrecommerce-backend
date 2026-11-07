/*
  Warnings:

  - You are about to drop the column `cover_image` on the `StoreAppearance` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "StoreAppearance" DROP COLUMN "cover_image",
ADD COLUMN     "cover_images" TEXT[];
