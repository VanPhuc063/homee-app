-- CreateEnum
CREATE TYPE "MaterialCategory" AS ENUM ('THO', 'SON', 'CUA', 'NOI_THAT');

-- AlterTable: MaterialCheckItem gains category/quantity/pricing fields
ALTER TABLE "MaterialCheckItem"
  ADD COLUMN "category" "MaterialCategory" NOT NULL DEFAULT 'THO',
  ADD COLUMN "quantityLabel" TEXT,
  ADD COLUMN "unitPrice" DECIMAL(15,0),
  ADD COLUMN "contractValue" DECIMAL(15,0);

-- CreateTable: MaterialDeliveryBatch (1 loại vật tư có nhiều đợt tập kết)
CREATE TABLE "MaterialDeliveryBatch" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "batchNumber" INTEGER NOT NULL,
    "supplierName" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "status" "MaterialItemStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialDeliveryBatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MaterialDeliveryBatch_itemId_batchNumber_key" ON "MaterialDeliveryBatch"("itemId", "batchNumber");

ALTER TABLE "MaterialDeliveryBatch" ADD CONSTRAINT "MaterialDeliveryBatch_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MaterialCheckItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: MaterialBatchComment
CREATE TABLE "MaterialBatchComment" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialBatchComment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MaterialBatchComment" ADD CONSTRAINT "MaterialBatchComment_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "MaterialDeliveryBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialBatchComment" ADD CONSTRAINT "MaterialBatchComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: implicit m2m MaterialCheckItem <-> Step ("Dùng cho: Việc X, Y, Z")
CREATE TABLE "_MaterialItemSteps" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

CREATE UNIQUE INDEX "_MaterialItemSteps_AB_unique" ON "_MaterialItemSteps"("A", "B");
CREATE INDEX "_MaterialItemSteps_B_index" ON "_MaterialItemSteps"("B");

ALTER TABLE "_MaterialItemSteps" ADD CONSTRAINT "_MaterialItemSteps_A_fkey" FOREIGN KEY ("A") REFERENCES "MaterialCheckItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_MaterialItemSteps" ADD CONSTRAINT "_MaterialItemSteps_B_fkey" FOREIGN KEY ("B") REFERENCES "Step"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DataMigration: mỗi MaterialCheckItem đang có sẵn 1 "Đợt 1" giữ nguyên status/note/quyết định
-- cũ, để không mất lịch sử đã có trước khi tách khỏi Item.
INSERT INTO "MaterialDeliveryBatch" ("id", "itemId", "batchNumber", "status", "note", "decidedAt", "decidedById", "createdAt")
SELECT gen_random_uuid()::text, "id", 1, "status", "note", "decidedAt", "decidedById", "createdAt"
FROM "MaterialCheckItem";

-- AlterTable: MaterialCheckPhoto trỏ sang batch thay vì thẳng vào item
ALTER TABLE "MaterialCheckPhoto" ADD COLUMN "batchId" TEXT;

UPDATE "MaterialCheckPhoto" p
SET "batchId" = b."id"
FROM "MaterialDeliveryBatch" b
WHERE b."itemId" = p."itemId" AND b."batchNumber" = 1;

ALTER TABLE "MaterialCheckPhoto" ALTER COLUMN "batchId" SET NOT NULL;
ALTER TABLE "MaterialCheckPhoto" DROP CONSTRAINT "MaterialCheckPhoto_itemId_fkey";
ALTER TABLE "MaterialCheckPhoto" DROP COLUMN "itemId";
ALTER TABLE "MaterialCheckPhoto" ADD CONSTRAINT "MaterialCheckPhoto_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "MaterialDeliveryBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
