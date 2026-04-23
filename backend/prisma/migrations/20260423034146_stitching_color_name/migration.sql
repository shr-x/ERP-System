-- CreateEnum
CREATE TYPE "StitchingMaterialSource" AS ENUM ('STORE', 'CUSTOMER');

-- AlterTable
ALTER TABLE "StitchingOrder" ADD COLUMN     "materialSource" "StitchingMaterialSource" NOT NULL DEFAULT 'STORE',
ADD COLUMN     "selectedColorName" TEXT;

-- AlterTable
ALTER TABLE "StitchingProductColor" ADD COLUMN     "colorName" TEXT NOT NULL DEFAULT '';
