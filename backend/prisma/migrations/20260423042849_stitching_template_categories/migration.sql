-- AlterTable
ALTER TABLE "StitchingProductTemplate" ADD COLUMN     "categoryId" UUID;

-- CreateTable
CREATE TABLE "StitchingTemplateCategory" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "posVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "StitchingTemplateCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StitchingTemplateCategory_orgId_idx" ON "StitchingTemplateCategory"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "StitchingTemplateCategory_orgId_name_key" ON "StitchingTemplateCategory"("orgId", "name");

-- CreateIndex
CREATE INDEX "StitchingProductTemplate_orgId_categoryId_idx" ON "StitchingProductTemplate"("orgId", "categoryId");

-- AddForeignKey
ALTER TABLE "StitchingTemplateCategory" ADD CONSTRAINT "StitchingTemplateCategory_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StitchingProductTemplate" ADD CONSTRAINT "StitchingProductTemplate_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "StitchingTemplateCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
