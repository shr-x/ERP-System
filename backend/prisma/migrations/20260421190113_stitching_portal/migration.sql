-- CreateEnum
CREATE TYPE "StitchingProductCategory" AS ENUM ('FULL_SET', 'TOP', 'PANTS', 'SLEEVES');

-- CreateEnum
CREATE TYPE "StitchingOrderStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "StitchingProductTemplate" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "StitchingProductCategory" NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "StitchingProductTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StitchingProductMeasurementProfile" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "measurementName" TEXT NOT NULL,
    "fields" TEXT[],

    CONSTRAINT "StitchingProductMeasurementProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StitchingProductColor" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "colorCode" VARCHAR(7) NOT NULL,
    "imageUrl" TEXT NOT NULL,

    CONSTRAINT "StitchingProductColor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StitchingProductMaterialConfig" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "erpMaterialId" UUID NOT NULL,
    "metersRequired" DECIMAL(14,3) NOT NULL,

    CONSTRAINT "StitchingProductMaterialConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StitchingCustomerProfile" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "erpCustomerId" UUID NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "StitchingCustomerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StitchingTailor" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "StitchingTailor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StitchingOrder" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "orderCode" TEXT NOT NULL,
    "erpInvoiceId" TEXT,
    "customerProfileId" UUID,
    "productTemplateId" UUID NOT NULL,
    "selectedColorCode" TEXT NOT NULL,
    "selectedColorImageUrl" TEXT,
    "measurementProfileName" TEXT,
    "measurements" JSONB NOT NULL DEFAULT '{}',
    "erpMaterialId" UUID,
    "materialUsageMeters" DECIMAL(14,3),
    "tailorId" UUID,
    "deliveryDate" TIMESTAMPTZ(6) NOT NULL,
    "pricePaise" BIGINT NOT NULL,
    "gstRateBp" INTEGER NOT NULL,
    "gstAmountPaise" BIGINT NOT NULL,
    "tailorCostPaise" BIGINT NOT NULL DEFAULT 0,
    "gstOnTailor" BOOLEAN NOT NULL DEFAULT false,
    "status" "StitchingOrderStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "StitchingOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StitchingProductTemplate_orgId_idx" ON "StitchingProductTemplate"("orgId");

-- CreateIndex
CREATE INDEX "StitchingProductTemplate_orgId_category_idx" ON "StitchingProductTemplate"("orgId", "category");

-- CreateIndex
CREATE INDEX "StitchingProductMeasurementProfile_productId_idx" ON "StitchingProductMeasurementProfile"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "StitchingProductMeasurementProfile_productId_measurementNam_key" ON "StitchingProductMeasurementProfile"("productId", "measurementName");

-- CreateIndex
CREATE INDEX "StitchingProductColor_productId_idx" ON "StitchingProductColor"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "StitchingProductColor_productId_colorCode_key" ON "StitchingProductColor"("productId", "colorCode");

-- CreateIndex
CREATE INDEX "StitchingProductMaterialConfig_productId_idx" ON "StitchingProductMaterialConfig"("productId");

-- CreateIndex
CREATE INDEX "StitchingCustomerProfile_orgId_createdAt_idx" ON "StitchingCustomerProfile"("orgId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "StitchingCustomerProfile_orgId_erpCustomerId_key" ON "StitchingCustomerProfile"("orgId", "erpCustomerId");

-- CreateIndex
CREATE INDEX "StitchingTailor_orgId_isActive_idx" ON "StitchingTailor"("orgId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "StitchingTailor_orgId_phone_key" ON "StitchingTailor"("orgId", "phone");

-- CreateIndex
CREATE INDEX "StitchingOrder_orgId_status_deliveryDate_idx" ON "StitchingOrder"("orgId", "status", "deliveryDate" DESC);

-- CreateIndex
CREATE INDEX "StitchingOrder_orgId_orderCode_idx" ON "StitchingOrder"("orgId", "orderCode");

-- CreateIndex
CREATE INDEX "StitchingOrder_orgId_customerProfileId_idx" ON "StitchingOrder"("orgId", "customerProfileId");

-- CreateIndex
CREATE INDEX "StitchingOrder_orgId_tailorId_idx" ON "StitchingOrder"("orgId", "tailorId");

-- CreateIndex
CREATE UNIQUE INDEX "StitchingOrder_orgId_orderCode_key" ON "StitchingOrder"("orgId", "orderCode");

-- AddForeignKey
ALTER TABLE "StitchingProductTemplate" ADD CONSTRAINT "StitchingProductTemplate_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StitchingProductMeasurementProfile" ADD CONSTRAINT "StitchingProductMeasurementProfile_productId_fkey" FOREIGN KEY ("productId") REFERENCES "StitchingProductTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StitchingProductColor" ADD CONSTRAINT "StitchingProductColor_productId_fkey" FOREIGN KEY ("productId") REFERENCES "StitchingProductTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StitchingProductMaterialConfig" ADD CONSTRAINT "StitchingProductMaterialConfig_productId_fkey" FOREIGN KEY ("productId") REFERENCES "StitchingProductTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StitchingCustomerProfile" ADD CONSTRAINT "StitchingCustomerProfile_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StitchingCustomerProfile" ADD CONSTRAINT "StitchingCustomerProfile_erpCustomerId_fkey" FOREIGN KEY ("erpCustomerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StitchingTailor" ADD CONSTRAINT "StitchingTailor_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StitchingOrder" ADD CONSTRAINT "StitchingOrder_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StitchingOrder" ADD CONSTRAINT "StitchingOrder_customerProfileId_fkey" FOREIGN KEY ("customerProfileId") REFERENCES "StitchingCustomerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StitchingOrder" ADD CONSTRAINT "StitchingOrder_productTemplateId_fkey" FOREIGN KEY ("productTemplateId") REFERENCES "StitchingProductTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StitchingOrder" ADD CONSTRAINT "StitchingOrder_tailorId_fkey" FOREIGN KEY ("tailorId") REFERENCES "StitchingTailor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
