-- So sánh giá đa nhà cung cấp (không ưu tiên riêng ai, kể cả Shopee):
-- Product trở thành catalog chung, giá/link chuyển sang ProductOffer (1 sản phẩm - N nhà cung cấp).
-- Giả định: bảng MaterialProposal chưa có dữ liệu thật (tính năng chưa có UI trước đợt này)
-- nên đổi productId -> offerId trực tiếp, không cần backfill.

-- DropForeignKey
ALTER TABLE "MaterialProposal" DROP CONSTRAINT "MaterialProposal_productId_fkey";

-- AlterTable
ALTER TABLE "Product"
  DROP COLUMN "price",
  DROP COLUMN "shopeePrice",
  DROP COLUMN "affiliateUrl",
  DROP COLUMN "sellType",
  ADD COLUMN "unit" TEXT,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- DropEnum
DROP TYPE "SellType";

-- AlterTable
ALTER TABLE "MaterialProposal"
  DROP COLUMN "productId",
  ADD COLUMN "offerId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isMarketplace" BOOLEAN NOT NULL DEFAULT false,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductOffer" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "price" DECIMAL(15,0) NOT NULL,
    "affiliateUrl" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE INDEX "ProductOffer_productId_price_idx" ON "ProductOffer"("productId", "price");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOffer_productId_supplierId_key" ON "ProductOffer"("productId", "supplierId");

-- AddForeignKey
ALTER TABLE "ProductOffer" ADD CONSTRAINT "ProductOffer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOffer" ADD CONSTRAINT "ProductOffer_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialProposal" ADD CONSTRAINT "MaterialProposal_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "ProductOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
