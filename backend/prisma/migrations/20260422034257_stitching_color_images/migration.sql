-- AlterTable
ALTER TABLE "StitchingProductColor" ADD COLUMN     "imageData" BYTEA,
ADD COLUMN     "imageMime" TEXT,
ALTER COLUMN "imageUrl" DROP NOT NULL;
