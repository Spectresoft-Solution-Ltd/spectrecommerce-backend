/*
  Warnings:

  - Added the required column `customer_name` to the `RefundRequest` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RefundStatus" ADD VALUE 'RECEIVED';
ALTER TYPE "RefundStatus" ADD VALUE 'PROCESSING';
ALTER TYPE "RefundStatus" ADD VALUE 'CANCELLED';
ALTER TYPE "RefundStatus" ADD VALUE 'FAILED';

-- DropForeignKey
ALTER TABLE "RefundRequest" DROP CONSTRAINT "RefundRequest_requested_by_user_id_fkey";

-- AlterTable
ALTER TABLE "RefundRequest" ADD COLUMN     "customer_name" TEXT NOT NULL,
ADD COLUMN     "payout_details" TEXT,
ADD COLUMN     "provider_reference" TEXT,
ADD COLUMN     "received_at" TIMESTAMP(3),
ALTER COLUMN "requested_by_user_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
