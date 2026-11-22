-- CreateEnum
CREATE TYPE "SupervisionRequestStatus" AS ENUM ('OPEN', 'MATCHED', 'CANCELLED');
CREATE TYPE "SupervisionQuoteStatus" AS ENUM ('PENDING', 'SELECTED', 'REJECTED');
CREATE TYPE "SupervisionPaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');

-- CreateTable: chủ nhà đăng yêu cầu thuê giám sát cho 1 vài bước/hạng mục cụ thể (marketplace)
CREATE TABLE "SupervisionRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "assignedPhaseCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "assignedStepIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" "SupervisionRequestStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupervisionRequest_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SupervisionRequest" ADD CONSTRAINT "SupervisionRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupervisionRequest" ADD CONSTRAINT "SupervisionRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: 1 báo giá của 1 giám sát cho 1 yêu cầu
CREATE TABLE "SupervisionQuote" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "supervisorId" TEXT NOT NULL,
    "price" DECIMAL(15,0) NOT NULL,
    "platformFee" DECIMAL(15,0) NOT NULL,
    "totalAmount" DECIMAL(15,0) NOT NULL,
    "note" TEXT,
    "status" "SupervisionQuoteStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupervisionQuote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupervisionQuote_requestId_supervisorId_key" ON "SupervisionQuote"("requestId", "supervisorId");

ALTER TABLE "SupervisionQuote" ADD CONSTRAINT "SupervisionQuote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SupervisionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupervisionQuote" ADD CONSTRAINT "SupervisionQuote_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: giao dịch thanh toán VNPay cho báo giá được chọn — tiền về merchant VNPay của
-- Homee (escrow), payout cho giám sát làm thủ công ngoài app
CREATE TABLE "SupervisionPayment" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "vnpTxnRef" TEXT NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,
    "status" "SupervisionPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "vnpResponseCode" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupervisionPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupervisionPayment_quoteId_key" ON "SupervisionPayment"("quoteId");
CREATE UNIQUE INDEX "SupervisionPayment_vnpTxnRef_key" ON "SupervisionPayment"("vnpTxnRef");

ALTER TABLE "SupervisionPayment" ADD CONSTRAINT "SupervisionPayment_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "SupervisionQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
