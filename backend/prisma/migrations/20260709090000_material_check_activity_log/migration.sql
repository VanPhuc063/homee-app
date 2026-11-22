-- Loại hợp đồng cho dự án + cổng duyệt vật tư trước thi công + nhật ký thi công.

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('THO_TRON_GOI', 'NHAN_CONG', 'TRON_GOI_A_Z');

-- CreateEnum
CREATE TYPE "MaterialCheckStatus" AS ENUM ('PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ActivityKind" AS ENUM (
  'NOTE',
  'STEP_SUBMITTED',
  'STEP_APPROVED',
  'STEP_REJECTED',
  'EVIDENCE_ADDED',
  'DEFECT_CREATED',
  'DEFECT_UPDATED',
  'PAYMENT_STAGE_CONFIRMED',
  'PLAN_APPROVED',
  'MATERIAL_CHECK_SUBMITTED',
  'MATERIAL_CHECK_DECIDED'
);

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "contractType" "ContractType" NOT NULL DEFAULT 'THO_TRON_GOI';

-- CreateTable
CREATE TABLE "MaterialCheck" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "MaterialCheckStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialCheckPhoto" (
    "id" TEXT NOT NULL,
    "materialCheckId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialCheckPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "actorId" TEXT,
    "kind" "ActivityKind" NOT NULL,
    "message" TEXT NOT NULL,
    "stepId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MaterialCheck_projectId_key" ON "MaterialCheck"("projectId");

-- CreateIndex
CREATE INDEX "ActivityLog_projectId_createdAt_idx" ON "ActivityLog"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "MaterialCheck" ADD CONSTRAINT "MaterialCheck_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialCheckPhoto" ADD CONSTRAINT "MaterialCheckPhoto_materialCheckId_fkey" FOREIGN KEY ("materialCheckId") REFERENCES "MaterialCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialCheckPhoto" ADD CONSTRAINT "MaterialCheckPhoto_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
