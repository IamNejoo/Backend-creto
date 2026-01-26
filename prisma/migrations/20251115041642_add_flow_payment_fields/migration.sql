/*
  Warnings:

  - A unique constraint covering the columns `[flow_token]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "public"."PaymentProvider" ADD VALUE 'flow';

-- AlterTable
ALTER TABLE "public"."Payment" ADD COLUMN     "flow_order_id" TEXT,
ADD COLUMN     "flow_token" TEXT,
ALTER COLUMN "provider" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_flow_token_key" ON "public"."Payment"("flow_token");
