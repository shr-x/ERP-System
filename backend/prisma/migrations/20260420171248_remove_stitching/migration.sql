/*
  Warnings:

  - You are about to drop the `StitchCustomerSize` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StitchOrder` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StitchProduct` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StitchProductColor` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StitchSize` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TailorJob` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "StitchCustomerSize" DROP CONSTRAINT "StitchCustomerSize_customerId_fkey";

-- DropForeignKey
ALTER TABLE "StitchCustomerSize" DROP CONSTRAINT "StitchCustomerSize_orgId_fkey";

-- DropForeignKey
ALTER TABLE "StitchCustomerSize" DROP CONSTRAINT "StitchCustomerSize_sizeId_fkey";

-- DropForeignKey
ALTER TABLE "StitchOrder" DROP CONSTRAINT "StitchOrder_customerId_fkey";

-- DropForeignKey
ALTER TABLE "StitchOrder" DROP CONSTRAINT "StitchOrder_orgId_fkey";

-- DropForeignKey
ALTER TABLE "StitchOrder" DROP CONSTRAINT "StitchOrder_productColorId_fkey";

-- DropForeignKey
ALTER TABLE "StitchOrder" DROP CONSTRAINT "StitchOrder_productId_fkey";

-- DropForeignKey
ALTER TABLE "StitchOrder" DROP CONSTRAINT "StitchOrder_sizeId_fkey";

-- DropForeignKey
ALTER TABLE "StitchOrder" DROP CONSTRAINT "StitchOrder_storeId_fkey";

-- DropForeignKey
ALTER TABLE "StitchProduct" DROP CONSTRAINT "StitchProduct_orgId_fkey";

-- DropForeignKey
ALTER TABLE "StitchProductColor" DROP CONSTRAINT "StitchProductColor_orgId_fkey";

-- DropForeignKey
ALTER TABLE "StitchProductColor" DROP CONSTRAINT "StitchProductColor_productId_fkey";

-- DropForeignKey
ALTER TABLE "StitchSize" DROP CONSTRAINT "StitchSize_customerId_fkey";

-- DropForeignKey
ALTER TABLE "StitchSize" DROP CONSTRAINT "StitchSize_orgId_fkey";

-- DropForeignKey
ALTER TABLE "TailorJob" DROP CONSTRAINT "TailorJob_orderId_fkey";

-- DropForeignKey
ALTER TABLE "TailorJob" DROP CONSTRAINT "TailorJob_orgId_fkey";

-- DropTable
DROP TABLE "StitchCustomerSize";

-- DropTable
DROP TABLE "StitchOrder";

-- DropTable
DROP TABLE "StitchProduct";

-- DropTable
DROP TABLE "StitchProductColor";

-- DropTable
DROP TABLE "StitchSize";

-- DropTable
DROP TABLE "TailorJob";

-- DropEnum
DROP TYPE "StitchOrderStatus";

-- DropEnum
DROP TYPE "StitchProductCategory";

-- DropEnum
DROP TYPE "StitchUnit";

-- DropEnum
DROP TYPE "TailorJobStatus";
