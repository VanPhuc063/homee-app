-- AlterEnum
ALTER TYPE "WithdrawalStatus" ADD VALUE 'REJECTED';

-- DropForeignKey
ALTER TABLE "Commission" DROP CONSTRAINT "Commission_founderId_fkey";

-- DropForeignKey
ALTER TABLE "Commission" DROP CONSTRAINT "Commission_salesRepId_fkey";

-- DropForeignKey
ALTER TABLE "Founder" DROP CONSTRAINT "Founder_userId_fkey";

-- DropForeignKey
ALTER TABLE "SalesRep" DROP CONSTRAINT "SalesRep_founderId_fkey";

-- DropForeignKey
ALTER TABLE "SalesRep" DROP CONSTRAINT "SalesRep_userId_fkey";

-- DropForeignKey
ALTER TABLE "UserReferral" DROP CONSTRAINT "UserReferral_userId_fkey";

-- DropIndex
DROP INDEX "Commission_founderId_idx";

-- DropIndex
DROP INDEX "Commission_salesRepId_idx";

-- AlterTable
ALTER TABLE "Commission" DROP COLUMN "founderAmount",
DROP COLUMN "founderId",
DROP COLUMN "salesAmount",
DROP COLUMN "salesRepId",
DROP COLUMN "totalAmount",
DROP COLUMN "type",
ADD COLUMN     "amount" DECIMAL(15,0) NOT NULL,
ADD COLUMN     "beneficiaryUserId" TEXT NOT NULL,
ADD COLUMN     "sourceUserId" TEXT NOT NULL;

-- AlterTable: referralCode thêm nullable trước, backfill cho user đã có sẵn, rồi mới bắt buộc +
-- unique (không thể ADD COLUMN NOT NULL thẳng vì bảng User đã có dữ liệu).
ALTER TABLE "User" ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referredById" TEXT;

UPDATE "User" SET "referralCode" = substr(md5(random()::text || id), 1, 8) WHERE "referralCode" IS NULL;

ALTER TABLE "User" ALTER COLUMN "referralCode" SET NOT NULL;

-- DropTable
DROP TABLE "Founder";

-- DropTable
DROP TABLE "SalesRep";

-- DropTable
DROP TABLE "UserReferral";

-- DropEnum
DROP TYPE "CommissionType";

-- DropEnum
DROP TYPE "SalesRepStatus";

-- CreateIndex
CREATE INDEX "Commission_beneficiaryUserId_idx" ON "Commission"("beneficiaryUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_beneficiaryUserId_fkey" FOREIGN KEY ("beneficiaryUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_sourceUserId_fkey" FOREIGN KEY ("sourceUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
