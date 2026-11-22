-- CreateEnum
CREATE TYPE "ExtraCostStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "ExtraCost" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,
    "note" TEXT,
    "phaseCode" TEXT,
    "createdById" TEXT NOT NULL,
    "status" "ExtraCostStatus" NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtraCost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExtraCost_projectId_idx" ON "ExtraCost"("projectId");

-- AddForeignKey
ALTER TABLE "ExtraCost" ADD CONSTRAINT "ExtraCost_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

