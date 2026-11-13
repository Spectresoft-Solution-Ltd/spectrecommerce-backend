/*
  Warnings:

  - Added the required column `product_description` to the `OrderItems` table without a default value. This is not possible if the table is not empty.
  - Added the required column `product_image` to the `OrderItems` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "OrderItems" ADD COLUMN     "product_description" TEXT NOT NULL,
ADD COLUMN     "product_image" TEXT NOT NULL;
