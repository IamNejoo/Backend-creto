-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "googleId" TEXT,
ALTER COLUMN "hash" DROP NOT NULL;
