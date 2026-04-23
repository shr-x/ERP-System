-- AlterEnum
ALTER TYPE "PrintJobKind" ADD VALUE 'CREDIT_SETTLEMENT';

-- AlterTable
ALTER TABLE "CustomerCreditSettlement" ADD COLUMN     "referenceNo" TEXT;

-- AlterTable
ALTER TABLE "PrintJob" ADD COLUMN     "creditSettlementId" UUID;

-- AddForeignKey
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_creditSettlementId_fkey" FOREIGN KEY ("creditSettlementId") REFERENCES "CustomerCreditSettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
