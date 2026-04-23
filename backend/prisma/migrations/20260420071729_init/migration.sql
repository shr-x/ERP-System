-- CreateEnum
CREATE TYPE "PrintJobKind" AS ENUM ('INVOICE', 'RETURN', 'CREDIT_RECEIPT');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "CartStatus" AS ENUM ('DRAFT', 'ABANDONED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "InvoiceTaxRegime" AS ENUM ('INTRA_STATE', 'INTER_STATE');

-- CreateEnum
CREATE TYPE "SalesInvoiceStatus" AS ENUM ('ISSUED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'UPI', 'DEBIT_CARD', 'CREDIT', 'STORE_CREDIT');

-- CreateEnum
CREATE TYPE "StockMoveType" AS ENUM ('SALE', 'PURCHASE', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT', 'RETURN');

-- CreateEnum
CREATE TYPE "JournalSourceType" AS ENUM ('SALE', 'PURCHASE', 'EXPENSE', 'ADJUSTMENT', 'RETURN', 'CUSTOMER_CREDIT');

-- CreateEnum
CREATE TYPE "JournalEntryStatus" AS ENUM ('POSTED', 'REVERSED', 'DRAFT');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'INCOME', 'EXPENSE', 'EQUITY');

-- CreateEnum
CREATE TYPE "PrintFormat" AS ENUM ('A4', 'THERMAL_80MM');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('GSTR1', 'GSTR3B', 'SALES_SUMMARY', 'INVENTORY');

-- CreateEnum
CREATE TYPE "LoyaltySourceType" AS ENUM ('SALE', 'ADJUSTMENT', 'REDEMPTION', 'RETURN');

-- CreateEnum
CREATE TYPE "ReturnCreditMode" AS ENUM ('LOYALTY', 'COUPON');

-- CreateEnum
CREATE TYPE "StitchProductCategory" AS ENUM ('TOP', 'FULL_SET', 'BOTTOM');

-- CreateEnum
CREATE TYPE "StitchUnit" AS ENUM ('INCH', 'CM');

-- CreateEnum
CREATE TYPE "StitchOrderStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'READY', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TailorJobStatus" AS ENUM ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'DONE');

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "gstin" TEXT,
    "legalAddress" TEXT NOT NULL,
    "stateCode" CHAR(2) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandingAsset" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "logoFilePath" TEXT NOT NULL,
    "logoMime" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "BrandingAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Store" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT,
    "stateCode" CHAR(2) NOT NULL,
    "gstin" TEXT,
    "footerNote" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "storeId" UUID,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "actorUserId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "gstin" TEXT,
    "isBusiness" BOOLEAN NOT NULL DEFAULT false,
    "stateCode" CHAR(2),
    "address" TEXT,
    "pincode" CHAR(6),
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "blockedAt" TIMESTAMPTZ(6),
    "creditBalancePaise" BIGINT NOT NULL DEFAULT 0,
    "creditDuePaise" BIGINT NOT NULL DEFAULT 0,
    "isWalkIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerCreditSettlement" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "salesInvoiceId" UUID,
    "amountPaise" BIGINT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "upiRef" TEXT,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerCreditSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyLedger" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "sourceType" "LoyaltySourceType" NOT NULL,
    "sourceId" UUID,
    "pointsDelta" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sizeLabel" TEXT NOT NULL DEFAULT 'NO_SIZE',
    "parentProductId" UUID,
    "hsnCode" TEXT NOT NULL,
    "gstRateBp" INTEGER NOT NULL,
    "sellingPricePaise" BIGINT NOT NULL,
    "costPricePaise" BIGINT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "imageUrl" TEXT,
    "imageData" BYTEA,
    "imageMime" TEXT,
    "categoryId" UUID,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "imageData" BYTEA,
    "imageMime" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBatch" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "batchNo" TEXT NOT NULL,
    "expiryDate" DATE,
    "qtyReceived" DECIMAL(14,3) NOT NULL,
    "qtyAvailable" DECIMAL(14,3) NOT NULL,
    "receivedAt" TIMESTAMPTZ(6) NOT NULL,
    "unitCostPaise" BIGINT NOT NULL,

    CONSTRAINT "InventoryBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMove" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "moveType" "StockMoveType" NOT NULL,
    "sourceRef" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fromWarehouseId" UUID,
    "toWarehouseId" UUID,

    CONSTRAINT "StockMove_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMoveLine" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "stockMoveId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "batchId" UUID,
    "qtyDelta" DECIMAL(14,3) NOT NULL,
    "unitCostPaise" BIGINT,

    CONSTRAINT "StockMoveLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesCart" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "customerId" UUID,
    "status" "CartStatus" NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SalesCart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesInvoice" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "invoiceDate" TIMESTAMPTZ(6) NOT NULL,
    "cashierUserId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "sellerGstin" TEXT NOT NULL,
    "sellerStateCode" CHAR(2) NOT NULL,
    "placeOfSupplyStateCode" CHAR(2) NOT NULL,
    "taxRegime" "InvoiceTaxRegime" NOT NULL,
    "subtotalPaise" BIGINT NOT NULL,
    "discountTotalPaise" BIGINT NOT NULL DEFAULT 0,
    "loyaltyRedeemPoints" INTEGER NOT NULL DEFAULT 0,
    "storeCreditAppliedPaise" BIGINT NOT NULL DEFAULT 0,
    "taxTotalPaise" BIGINT NOT NULL,
    "cgstTotalPaise" BIGINT NOT NULL,
    "sgstTotalPaise" BIGINT NOT NULL,
    "igstTotalPaise" BIGINT NOT NULL,
    "grandTotalPaise" BIGINT NOT NULL,
    "roundingPaise" BIGINT NOT NULL DEFAULT 0,
    "status" "SalesInvoiceStatus" NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveryAddress" TEXT,
    "deliveryPincode" CHAR(6),

    CONSTRAINT "SalesInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesInvoiceLine" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "productId" UUID NOT NULL,
    "productName" TEXT NOT NULL,
    "hsnCode" TEXT NOT NULL,
    "gstRateBp" INTEGER NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "unitPricePaise" BIGINT NOT NULL,
    "discountPaise" BIGINT NOT NULL DEFAULT 0,
    "taxableValuePaise" BIGINT NOT NULL,
    "cgstRateBp" INTEGER NOT NULL,
    "sgstRateBp" INTEGER NOT NULL,
    "igstRateBp" INTEGER NOT NULL,
    "cgstAmountPaise" BIGINT NOT NULL,
    "sgstAmountPaise" BIGINT NOT NULL,
    "igstAmountPaise" BIGINT NOT NULL,
    "lineTotalPaise" BIGINT NOT NULL,

    CONSTRAINT "SalesInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amountPaise" BIGINT NOT NULL,
    "upiRef" TEXT,
    "receivedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceSeries" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "financialYear" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "nextNumber" INTEGER NOT NULL,

    CONSTRAINT "InvoiceSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "gstin" TEXT,
    "stateCode" CHAR(2),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseInvoice" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "supplierInvoiceNo" TEXT NOT NULL,
    "invoiceDate" DATE NOT NULL,
    "subtotalPaise" BIGINT NOT NULL,
    "taxTotalPaise" BIGINT NOT NULL,
    "cgstTotalPaise" BIGINT NOT NULL,
    "sgstTotalPaise" BIGINT NOT NULL,
    "igstTotalPaise" BIGINT NOT NULL,
    "grandTotalPaise" BIGINT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseInvoiceLine" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "purchaseInvoiceId" UUID NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "productId" UUID NOT NULL,
    "hsnCode" TEXT NOT NULL,
    "gstRateBp" INTEGER NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "unitCostPaise" BIGINT NOT NULL,
    "taxableValuePaise" BIGINT NOT NULL,
    "cgstRateBp" INTEGER NOT NULL,
    "sgstRateBp" INTEGER NOT NULL,
    "igstRateBp" INTEGER NOT NULL,
    "cgstAmountPaise" BIGINT NOT NULL,
    "sgstAmountPaise" BIGINT NOT NULL,
    "igstAmountPaise" BIGINT NOT NULL,
    "lineTotalPaise" BIGINT NOT NULL,

    CONSTRAINT "PurchaseInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChartAccount" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChartAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "entryDate" TIMESTAMPTZ(6) NOT NULL,
    "sourceType" "JournalSourceType" NOT NULL,
    "salesInvoiceId" UUID,
    "purchaseInvoiceId" UUID,
    "narration" TEXT NOT NULL,
    "postedByUserId" UUID NOT NULL,
    "status" "JournalEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "journalEntryId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "debitPaise" BIGINT NOT NULL DEFAULT 0,
    "creditPaise" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintJob" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "kind" "PrintJobKind" NOT NULL DEFAULT 'INVOICE',
    "invoiceId" UUID,
    "salesReturnId" UUID,
    "creditReceiptId" UUID,
    "format" "PrintFormat" NOT NULL,
    "pdfPath" TEXT,
    "htmlSnapshot" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "htmlPath" TEXT,

    CONSTRAINT "PrintJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportExport" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "storeId" UUID,
    "reportType" "ReportType" NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "filePath" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceShareLink" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesReturnShareLink" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "salesReturnId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesReturnShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerCreditReceipt" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "receiptNo" TEXT NOT NULL,
    "receiptDate" TIMESTAMPTZ(6) NOT NULL,
    "customerId" UUID NOT NULL,
    "amountPaise" BIGINT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "upiRef" TEXT,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerCreditReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerCreditUse" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "amountPaise" BIGINT NOT NULL,
    "usedByUserId" UUID NOT NULL,
    "usedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerCreditUse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerCreditShareLink" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "receiptId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerCreditShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackLink" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "customerId" UUID,
    "customerName" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT,
    "amountPaise" BIGINT NOT NULL,
    "usesTotal" INTEGER NOT NULL,
    "usesRemaining" INTEGER NOT NULL,
    "validFrom" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMPTZ(6),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponRedemption" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "couponId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "redeemedByUserId" UUID NOT NULL,
    "amountAppliedPaise" BIGINT NOT NULL,
    "redeemedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesReturn" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "salesInvoiceId" UUID NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "customerId" UUID NOT NULL,
    "processedByUserId" UUID NOT NULL,
    "mode" "ReturnCreditMode" NOT NULL,
    "amountPaise" BIGINT NOT NULL,
    "pointsCredited" INTEGER NOT NULL DEFAULT 0,
    "couponId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesReturnLine" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "salesReturnId" UUID NOT NULL,
    "salesInvoiceLineId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "productName" TEXT NOT NULL,
    "hsnCode" TEXT NOT NULL,
    "gstRateBp" INTEGER NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "taxableValuePaise" BIGINT NOT NULL,
    "cgstAmountPaise" BIGINT NOT NULL,
    "sgstAmountPaise" BIGINT NOT NULL,
    "igstAmountPaise" BIGINT NOT NULL,
    "lineTotalPaise" BIGINT NOT NULL,

    CONSTRAINT "SalesReturnLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StitchProduct" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "StitchProductCategory" NOT NULL,
    "allowedParts" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StitchProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StitchProductColor" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "colorName" TEXT NOT NULL,
    "designImageUrl" TEXT,
    "designImageData" BYTEA,
    "designImageMime" TEXT,
    "linkedFabricProdId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StitchProductColor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StitchSize" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "customerId" UUID,
    "name" TEXT NOT NULL,
    "unit" "StitchUnit" NOT NULL DEFAULT 'INCH',
    "fullShoulder" DECIMAL(6,2),
    "armhole" DECIMAL(6,2),
    "chest" DECIMAL(6,2),
    "bustPoint" DECIMAL(6,2),
    "cupSize" TEXT,
    "frontCross" DECIMAL(6,2),
    "backCross" DECIMAL(6,2),
    "frontNeckDepth" DECIMAL(6,2),
    "backNeckDepth" DECIMAL(6,2),
    "frontLength" DECIMAL(6,2),
    "backLength" DECIMAL(6,2),
    "sleeveLength" DECIMAL(6,2),
    "sleeveRound" DECIMAL(6,2),
    "biceps" DECIMAL(6,2),
    "bodyWaist" DECIMAL(6,2),
    "bodyHip" DECIMAL(6,2),
    "kurtaLength" DECIMAL(6,2),
    "pantWaist" DECIMAL(6,2),
    "pantThigh" DECIMAL(6,2),
    "pantKnee" DECIMAL(6,2),
    "pantBottomWidth" DECIMAL(6,2),
    "pantLength" DECIMAL(6,2),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StitchSize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StitchCustomerSize" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "sizeId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StitchCustomerSize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StitchOrder" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "orderNo" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "productColorId" UUID NOT NULL,
    "sizeId" UUID NOT NULL,
    "sizeSnapshot" JSONB NOT NULL,
    "stitchPricePaise" BIGINT NOT NULL,
    "gstRateBp" INTEGER NOT NULL,
    "gstAmountPaise" BIGINT NOT NULL,
    "totalPaise" BIGINT NOT NULL,
    "notes" TEXT,
    "deliveryDate" DATE,
    "status" "StitchOrderStatus" NOT NULL DEFAULT 'NEW',

    CONSTRAINT "StitchOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TailorJob" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "status" "TailorJobStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TailorJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BrandingAsset_orgId_idx" ON "BrandingAsset"("orgId");

-- CreateIndex
CREATE INDEX "Store_orgId_idx" ON "Store"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Store_orgId_code_key" ON "Store"("orgId", "code");

-- CreateIndex
CREATE INDEX "Warehouse_orgId_idx" ON "Warehouse"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_storeId_name_key" ON "Warehouse"("storeId", "name");

-- CreateIndex
CREATE INDEX "User_orgId_storeId_idx" ON "User"("orgId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "User_orgId_phone_key" ON "User"("orgId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_orgId_email_key" ON "User"("orgId", "email");

-- CreateIndex
CREATE INDEX "AuditLog_orgId_createdAt_idx" ON "AuditLog"("orgId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_orgId_entityType_entityId_idx" ON "AuditLog"("orgId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "Customer_orgId_idx" ON "Customer"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_orgId_phone_key" ON "Customer"("orgId", "phone");

-- CreateIndex
CREATE INDEX "CustomerCreditSettlement_orgId_createdAt_idx" ON "CustomerCreditSettlement"("orgId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "CustomerCreditSettlement_orgId_customerId_createdAt_idx" ON "CustomerCreditSettlement"("orgId", "customerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "CustomerCreditSettlement_orgId_storeId_createdAt_idx" ON "CustomerCreditSettlement"("orgId", "storeId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "LoyaltyLedger_orgId_customerId_createdAt_idx" ON "LoyaltyLedger"("orgId", "customerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Product_orgId_name_idx" ON "Product"("orgId", "name");

-- CreateIndex
CREATE INDEX "Product_orgId_sizeLabel_idx" ON "Product"("orgId", "sizeLabel");

-- CreateIndex
CREATE INDEX "Product_orgId_categoryId_idx" ON "Product"("orgId", "categoryId");

-- CreateIndex
CREATE INDEX "Product_orgId_parentProductId_idx" ON "Product"("orgId", "parentProductId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_orgId_code_key" ON "Product"("orgId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Product_orgId_parentProductId_sizeLabel_key" ON "Product"("orgId", "parentProductId", "sizeLabel");

-- CreateIndex
CREATE INDEX "ProductCategory_orgId_idx" ON "ProductCategory"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_orgId_name_key" ON "ProductCategory"("orgId", "name");

-- CreateIndex
CREATE INDEX "InventoryBatch_warehouseId_productId_receivedAt_idx" ON "InventoryBatch"("warehouseId", "productId", "receivedAt");

-- CreateIndex
CREATE INDEX "InventoryBatch_orgId_idx" ON "InventoryBatch"("orgId");

-- CreateIndex
CREATE INDEX "StockMove_orgId_storeId_createdAt_idx" ON "StockMove"("orgId", "storeId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "StockMove_orgId_fromWarehouseId_createdAt_idx" ON "StockMove"("orgId", "fromWarehouseId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "StockMove_orgId_toWarehouseId_createdAt_idx" ON "StockMove"("orgId", "toWarehouseId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "StockMoveLine_productId_batchId_idx" ON "StockMoveLine"("productId", "batchId");

-- CreateIndex
CREATE INDEX "StockMoveLine_orgId_idx" ON "StockMoveLine"("orgId");

-- CreateIndex
CREATE INDEX "SalesCart_orgId_storeId_updatedAt_idx" ON "SalesCart"("orgId", "storeId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "SalesInvoice_storeId_invoiceDate_idx" ON "SalesInvoice"("storeId", "invoiceDate" DESC);

-- CreateIndex
CREATE INDEX "SalesInvoice_orgId_invoiceNo_idx" ON "SalesInvoice"("orgId", "invoiceNo");

-- CreateIndex
CREATE UNIQUE INDEX "SalesInvoice_orgId_storeId_invoiceNo_key" ON "SalesInvoice"("orgId", "storeId", "invoiceNo");

-- CreateIndex
CREATE INDEX "SalesInvoiceLine_orgId_idx" ON "SalesInvoiceLine"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesInvoiceLine_invoiceId_lineNo_key" ON "SalesInvoiceLine"("invoiceId", "lineNo");

-- CreateIndex
CREATE INDEX "Payment_orgId_storeId_receivedAt_idx" ON "Payment"("orgId", "storeId", "receivedAt" DESC);

-- CreateIndex
CREATE INDEX "InvoiceSeries_orgId_idx" ON "InvoiceSeries"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceSeries_storeId_financialYear_key" ON "InvoiceSeries"("storeId", "financialYear");

-- CreateIndex
CREATE INDEX "Supplier_orgId_idx" ON "Supplier"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_orgId_name_key" ON "Supplier"("orgId", "name");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_orgId_storeId_createdAt_idx" ON "PurchaseInvoice"("orgId", "storeId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PurchaseInvoiceLine_orgId_idx" ON "PurchaseInvoiceLine"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseInvoiceLine_purchaseInvoiceId_lineNo_key" ON "PurchaseInvoiceLine"("purchaseInvoiceId", "lineNo");

-- CreateIndex
CREATE INDEX "ChartAccount_orgId_idx" ON "ChartAccount"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "ChartAccount_orgId_code_key" ON "ChartAccount"("orgId", "code");

-- CreateIndex
CREATE INDEX "JournalEntry_orgId_entryDate_idx" ON "JournalEntry"("orgId", "entryDate" DESC);

-- CreateIndex
CREATE INDEX "JournalLine_orgId_idx" ON "JournalLine"("orgId");

-- CreateIndex
CREATE INDEX "PrintJob_orgId_createdAt_idx" ON "PrintJob"("orgId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PrintJob_orgId_kind_createdAt_idx" ON "PrintJob"("orgId", "kind", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ReportExport_orgId_createdAt_idx" ON "ReportExport"("orgId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceShareLink_token_key" ON "InvoiceShareLink"("token");

-- CreateIndex
CREATE INDEX "InvoiceShareLink_orgId_createdAt_idx" ON "InvoiceShareLink"("orgId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "SalesReturnShareLink_token_key" ON "SalesReturnShareLink"("token");

-- CreateIndex
CREATE INDEX "SalesReturnShareLink_orgId_createdAt_idx" ON "SalesReturnShareLink"("orgId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SalesReturnShareLink_orgId_salesReturnId_idx" ON "SalesReturnShareLink"("orgId", "salesReturnId");

-- CreateIndex
CREATE INDEX "CustomerCreditReceipt_orgId_storeId_receiptDate_idx" ON "CustomerCreditReceipt"("orgId", "storeId", "receiptDate" DESC);

-- CreateIndex
CREATE INDEX "CustomerCreditReceipt_orgId_customerId_receiptDate_idx" ON "CustomerCreditReceipt"("orgId", "customerId", "receiptDate" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerCreditReceipt_orgId_storeId_receiptNo_key" ON "CustomerCreditReceipt"("orgId", "storeId", "receiptNo");

-- CreateIndex
CREATE INDEX "CustomerCreditUse_orgId_customerId_usedAt_idx" ON "CustomerCreditUse"("orgId", "customerId", "usedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerCreditUse_invoiceId_key" ON "CustomerCreditUse"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerCreditShareLink_token_key" ON "CustomerCreditShareLink"("token");

-- CreateIndex
CREATE INDEX "CustomerCreditShareLink_orgId_createdAt_idx" ON "CustomerCreditShareLink"("orgId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "CustomerCreditShareLink_orgId_receiptId_idx" ON "CustomerCreditShareLink"("orgId", "receiptId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackLink_token_key" ON "FeedbackLink"("token");

-- CreateIndex
CREATE INDEX "FeedbackLink_orgId_createdAt_idx" ON "FeedbackLink"("orgId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackLink_invoiceId_key" ON "FeedbackLink"("invoiceId");

-- CreateIndex
CREATE INDEX "Feedback_orgId_createdAt_idx" ON "Feedback"("orgId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Feedback_orgId_invoiceId_idx" ON "Feedback"("orgId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Feedback_invoiceId_key" ON "Feedback"("invoiceId");

-- CreateIndex
CREATE INDEX "Coupon_orgId_createdAt_idx" ON "Coupon"("orgId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_orgId_code_key" ON "Coupon"("orgId", "code");

-- CreateIndex
CREATE INDEX "CouponRedemption_orgId_storeId_redeemedAt_idx" ON "CouponRedemption"("orgId", "storeId", "redeemedAt" DESC);

-- CreateIndex
CREATE INDEX "CouponRedemption_orgId_couponId_redeemedAt_idx" ON "CouponRedemption"("orgId", "couponId", "redeemedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "CouponRedemption_couponId_invoiceId_key" ON "CouponRedemption"("couponId", "invoiceId");

-- CreateIndex
CREATE INDEX "SalesReturn_orgId_storeId_createdAt_idx" ON "SalesReturn"("orgId", "storeId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SalesReturn_orgId_invoiceNo_idx" ON "SalesReturn"("orgId", "invoiceNo");

-- CreateIndex
CREATE INDEX "SalesReturnLine_orgId_idx" ON "SalesReturnLine"("orgId");

-- CreateIndex
CREATE INDEX "SalesReturnLine_salesReturnId_idx" ON "SalesReturnLine"("salesReturnId");

-- CreateIndex
CREATE INDEX "StitchProduct_orgId_name_idx" ON "StitchProduct"("orgId", "name");

-- CreateIndex
CREATE INDEX "StitchProductColor_orgId_productId_idx" ON "StitchProductColor"("orgId", "productId");

-- CreateIndex
CREATE INDEX "StitchSize_orgId_customerId_name_idx" ON "StitchSize"("orgId", "customerId", "name");

-- CreateIndex
CREATE INDEX "StitchCustomerSize_orgId_customerId_idx" ON "StitchCustomerSize"("orgId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "StitchCustomerSize_orgId_customerId_label_key" ON "StitchCustomerSize"("orgId", "customerId", "label");

-- CreateIndex
CREATE INDEX "StitchOrder_orgId_storeId_createdAt_idx" ON "StitchOrder"("orgId", "storeId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "StitchOrder_orgId_orderNo_key" ON "StitchOrder"("orgId", "orderNo");

-- CreateIndex
CREATE INDEX "TailorJob_orgId_orderId_idx" ON "TailorJob"("orgId", "orderId");

-- AddForeignKey
ALTER TABLE "BrandingAsset" ADD CONSTRAINT "BrandingAsset_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Store" ADD CONSTRAINT "Store_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCreditSettlement" ADD CONSTRAINT "CustomerCreditSettlement_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCreditSettlement" ADD CONSTRAINT "CustomerCreditSettlement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCreditSettlement" ADD CONSTRAINT "CustomerCreditSettlement_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCreditSettlement" ADD CONSTRAINT "CustomerCreditSettlement_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "SalesInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCreditSettlement" ADD CONSTRAINT "CustomerCreditSettlement_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyLedger" ADD CONSTRAINT "LoyaltyLedger_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyLedger" ADD CONSTRAINT "LoyaltyLedger_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_parentProductId_fkey" FOREIGN KEY ("parentProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMove" ADD CONSTRAINT "StockMove_fromWarehouseId_fkey" FOREIGN KEY ("fromWarehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMove" ADD CONSTRAINT "StockMove_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMove" ADD CONSTRAINT "StockMove_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMove" ADD CONSTRAINT "StockMove_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMoveLine" ADD CONSTRAINT "StockMoveLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMoveLine" ADD CONSTRAINT "StockMoveLine_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMoveLine" ADD CONSTRAINT "StockMoveLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMoveLine" ADD CONSTRAINT "StockMoveLine_stockMoveId_fkey" FOREIGN KEY ("stockMoveId") REFERENCES "StockMove"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesCart" ADD CONSTRAINT "SalesCart_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesCart" ADD CONSTRAINT "SalesCart_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesCart" ADD CONSTRAINT "SalesCart_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesCart" ADD CONSTRAINT "SalesCart_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_cashierUserId_fkey" FOREIGN KEY ("cashierUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceSeries" ADD CONSTRAINT "InvoiceSeries_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceSeries" ADD CONSTRAINT "InvoiceSeries_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoiceLine" ADD CONSTRAINT "PurchaseInvoiceLine_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoiceLine" ADD CONSTRAINT "PurchaseInvoiceLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoiceLine" ADD CONSTRAINT "PurchaseInvoiceLine_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartAccount" ADD CONSTRAINT "ChartAccount_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_postedByUserId_fkey" FOREIGN KEY ("postedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "SalesInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ChartAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_salesReturnId_fkey" FOREIGN KEY ("salesReturnId") REFERENCES "SalesReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_creditReceiptId_fkey" FOREIGN KEY ("creditReceiptId") REFERENCES "CustomerCreditReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportExport" ADD CONSTRAINT "ReportExport_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportExport" ADD CONSTRAINT "ReportExport_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceShareLink" ADD CONSTRAINT "InvoiceShareLink_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceShareLink" ADD CONSTRAINT "InvoiceShareLink_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturnShareLink" ADD CONSTRAINT "SalesReturnShareLink_salesReturnId_fkey" FOREIGN KEY ("salesReturnId") REFERENCES "SalesReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturnShareLink" ADD CONSTRAINT "SalesReturnShareLink_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCreditReceipt" ADD CONSTRAINT "CustomerCreditReceipt_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCreditReceipt" ADD CONSTRAINT "CustomerCreditReceipt_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCreditReceipt" ADD CONSTRAINT "CustomerCreditReceipt_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCreditReceipt" ADD CONSTRAINT "CustomerCreditReceipt_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCreditUse" ADD CONSTRAINT "CustomerCreditUse_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCreditUse" ADD CONSTRAINT "CustomerCreditUse_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCreditUse" ADD CONSTRAINT "CustomerCreditUse_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCreditUse" ADD CONSTRAINT "CustomerCreditUse_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCreditUse" ADD CONSTRAINT "CustomerCreditUse_usedByUserId_fkey" FOREIGN KEY ("usedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCreditShareLink" ADD CONSTRAINT "CustomerCreditShareLink_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "CustomerCreditReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCreditShareLink" ADD CONSTRAINT "CustomerCreditShareLink_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackLink" ADD CONSTRAINT "FeedbackLink_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackLink" ADD CONSTRAINT "FeedbackLink_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_redeemedByUserId_fkey" FOREIGN KEY ("redeemedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "SalesInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_processedByUserId_fkey" FOREIGN KEY ("processedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturnLine" ADD CONSTRAINT "SalesReturnLine_salesReturnId_fkey" FOREIGN KEY ("salesReturnId") REFERENCES "SalesReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturnLine" ADD CONSTRAINT "SalesReturnLine_salesInvoiceLineId_fkey" FOREIGN KEY ("salesInvoiceLineId") REFERENCES "SalesInvoiceLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturnLine" ADD CONSTRAINT "SalesReturnLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturnLine" ADD CONSTRAINT "SalesReturnLine_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StitchProduct" ADD CONSTRAINT "StitchProduct_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StitchProductColor" ADD CONSTRAINT "StitchProductColor_productId_fkey" FOREIGN KEY ("productId") REFERENCES "StitchProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StitchProductColor" ADD CONSTRAINT "StitchProductColor_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StitchSize" ADD CONSTRAINT "StitchSize_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StitchSize" ADD CONSTRAINT "StitchSize_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StitchCustomerSize" ADD CONSTRAINT "StitchCustomerSize_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StitchCustomerSize" ADD CONSTRAINT "StitchCustomerSize_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StitchCustomerSize" ADD CONSTRAINT "StitchCustomerSize_sizeId_fkey" FOREIGN KEY ("sizeId") REFERENCES "StitchSize"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StitchOrder" ADD CONSTRAINT "StitchOrder_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StitchOrder" ADD CONSTRAINT "StitchOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StitchOrder" ADD CONSTRAINT "StitchOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StitchOrder" ADD CONSTRAINT "StitchOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "StitchProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StitchOrder" ADD CONSTRAINT "StitchOrder_productColorId_fkey" FOREIGN KEY ("productColorId") REFERENCES "StitchProductColor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StitchOrder" ADD CONSTRAINT "StitchOrder_sizeId_fkey" FOREIGN KEY ("sizeId") REFERENCES "StitchSize"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TailorJob" ADD CONSTRAINT "TailorJob_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TailorJob" ADD CONSTRAINT "TailorJob_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "StitchOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
