-- AlterTable
ALTER TABLE "StitchingOrder" ADD COLUMN     "storeId" UUID;

-- CreateIndex
CREATE INDEX "StitchingOrder_orgId_storeId_idx" ON "StitchingOrder"("orgId", "storeId");

-- AddForeignKey
ALTER TABLE "StitchingOrder" ADD CONSTRAINT "StitchingOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
