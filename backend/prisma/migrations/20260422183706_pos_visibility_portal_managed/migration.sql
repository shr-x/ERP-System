-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "isPortalManaged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "posVisible" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "ProductCategory" ADD COLUMN     "posVisible" BOOLEAN NOT NULL DEFAULT true;
