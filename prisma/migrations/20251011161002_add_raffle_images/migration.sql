-- CreateTable
CREATE TABLE "public"."RaffleImage" (
    "id" TEXT NOT NULL,
    "raffleId" TEXT NOT NULL,
    "s3_key" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RaffleImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RaffleImage_raffleId_idx" ON "public"."RaffleImage"("raffleId");

-- CreateIndex
CREATE INDEX "RaffleImage_is_primary_idx" ON "public"."RaffleImage"("is_primary");

-- CreateIndex
CREATE INDEX "RaffleImage_position_idx" ON "public"."RaffleImage"("position");

-- AddForeignKey
ALTER TABLE "public"."RaffleImage" ADD CONSTRAINT "RaffleImage_raffleId_fkey" FOREIGN KEY ("raffleId") REFERENCES "public"."Raffle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
