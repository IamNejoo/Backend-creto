-- CreateEnum
CREATE TYPE "public"."RaffleMode" AS ENUM ('tickets', 'purchases');

-- AlterTable
ALTER TABLE "public"."Raffle" ADD COLUMN     "amount_per_entry_clp" INTEGER,
ADD COLUMN     "entries_per_item" INTEGER,
ADD COLUMN     "is_featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mode" "public"."RaffleMode" NOT NULL DEFAULT 'tickets';

-- AlterTable
ALTER TABLE "public"."RafflePricingTier" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "ends_at" TIMESTAMP(3),
ADD COLUMN     "label" TEXT,
ADD COLUMN     "sort" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "starts_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "public"."RaffleEntry" (
    "id" TEXT NOT NULL,
    "raffleId" TEXT NOT NULL,
    "userId" TEXT,
    "orderId" TEXT,
    "entries" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT NOT NULL DEFAULT 'order',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RaffleEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RaffleEntry_raffleId_idx" ON "public"."RaffleEntry"("raffleId");

-- CreateIndex
CREATE INDEX "RaffleEntry_userId_idx" ON "public"."RaffleEntry"("userId");

-- CreateIndex
CREATE INDEX "RaffleEntry_orderId_idx" ON "public"."RaffleEntry"("orderId");

-- CreateIndex
CREATE INDEX "Raffle_is_featured_idx" ON "public"."Raffle"("is_featured");

-- CreateIndex
CREATE INDEX "Raffle_mode_idx" ON "public"."Raffle"("mode");

-- CreateIndex
CREATE INDEX "RafflePricingTier_active_idx" ON "public"."RafflePricingTier"("active");

-- CreateIndex
CREATE INDEX "RafflePricingTier_starts_at_idx" ON "public"."RafflePricingTier"("starts_at");

-- CreateIndex
CREATE INDEX "RafflePricingTier_ends_at_idx" ON "public"."RafflePricingTier"("ends_at");

-- AddForeignKey
ALTER TABLE "public"."RaffleEntry" ADD CONSTRAINT "RaffleEntry_raffleId_fkey" FOREIGN KEY ("raffleId") REFERENCES "public"."Raffle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RaffleEntry" ADD CONSTRAINT "RaffleEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RaffleEntry" ADD CONSTRAINT "RaffleEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
