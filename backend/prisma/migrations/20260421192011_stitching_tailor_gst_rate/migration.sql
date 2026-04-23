-- AlterTable
ALTER TABLE "StitchingOrder" ADD COLUMN     "tailorExpenseJournalEntryId" TEXT,
ADD COLUMN     "tailorExpensePostedAt" TIMESTAMPTZ(6),
ADD COLUMN     "tailorGstRateBp" INTEGER NOT NULL DEFAULT 0;
