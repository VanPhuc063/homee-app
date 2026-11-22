/*
  Warnings:

  - You are about to drop the column `label` on the `MaterialCheckPhoto` table. All the data in the column will be lost.
  - You are about to drop the column `materialCheckId` on the `MaterialCheckPhoto` table. All the data in the column will be lost.
  - Added the required column `itemId` to the `MaterialCheckPhoto` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "MaterialItemStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- DropForeignKey
ALTER TABLE "MaterialCheckPhoto" DROP CONSTRAINT "MaterialCheckPhoto_materialCheckId_fkey";

-- AlterTable
ALTER TABLE "MaterialCheckPhoto" DROP COLUMN "label",
DROP COLUMN "materialCheckId",
ADD COLUMN     "itemId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "MaterialCheckItem" (
    "id" TEXT NOT NULL,
    "materialCheckId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "MaterialItemStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialCheckItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MaterialCheckItem_materialCheckId_label_key" ON "MaterialCheckItem"("materialCheckId", "label");

-- AddForeignKey
ALTER TABLE "MaterialCheckItem" ADD CONSTRAINT "MaterialCheckItem_materialCheckId_fkey" FOREIGN KEY ("materialCheckId") REFERENCES "MaterialCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialCheckPhoto" ADD CONSTRAINT "MaterialCheckPhoto_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MaterialCheckItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
