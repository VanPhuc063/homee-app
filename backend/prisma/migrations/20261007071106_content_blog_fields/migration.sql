-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "description" TEXT,
ADD COLUMN     "emoji" TEXT,
ADD COLUMN     "originalPrice" DECIMAL(15,0);

-- AlterTable
ALTER TABLE "Tip" ADD COLUMN     "category" TEXT,
ADD COLUMN     "emoji" TEXT,
ADD COLUMN     "readMinutes" INTEGER;

