/*
  Warnings:

  - You are about to drop the column `sold_tickets` on the `Raffle` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Raffle" DROP COLUMN "sold_tickets",
ADD COLUMN     "paid_tickets" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reserved_tickets" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "public"."RafflePricingTier" (
    "id" TEXT NOT NULL,
    "raffleId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price_clp" INTEGER NOT NULL,

    CONSTRAINT "RafflePricingTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RafflePricingTier_raffleId_idx" ON "public"."RafflePricingTier"("raffleId");

-- CreateIndex
CREATE UNIQUE INDEX "RafflePricingTier_raffleId_quantity_key" ON "public"."RafflePricingTier"("raffleId", "quantity");

-- CreateIndex
CREATE INDEX "Raffle_starts_at_idx" ON "public"."Raffle"("starts_at");

-- CreateIndex
CREATE INDEX "Raffle_ends_at_idx" ON "public"."Raffle"("ends_at");

-- CreateIndex
CREATE INDEX "RaffleTicket_raffleId_status_idx" ON "public"."RaffleTicket"("raffleId", "status");

-- CreateIndex
CREATE INDEX "RaffleTicket_reservation_expires_at_idx" ON "public"."RaffleTicket"("reservation_expires_at");

-- AddForeignKey
ALTER TABLE "public"."RafflePricingTier" ADD CONSTRAINT "RafflePricingTier_raffleId_fkey" FOREIGN KEY ("raffleId") REFERENCES "public"."Raffle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
