-- CreateEnum
CREATE TYPE "PlanChangeType" AS ENUM ('ADD_PHASE', 'REMOVE_PHASE', 'ADD_STEP', 'REMOVE_STEP', 'ADJUST_DURATION');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityKind" ADD VALUE 'PHASE_ADDED';
ALTER TYPE "ActivityKind" ADD VALUE 'PHASE_REMOVED';
ALTER TYPE "ActivityKind" ADD VALUE 'STEP_ADDED';
ALTER TYPE "ActivityKind" ADD VALUE 'STEP_REMOVED';
ALTER TYPE "ActivityKind" ADD VALUE 'PHASE_DURATION_CHANGED';
ALTER TYPE "ActivityKind" ADD VALUE 'PLAN_CHANGE_REQUESTED';
ALTER TYPE "ActivityKind" ADD VALUE 'PLAN_CHANGE_APPROVED';
ALTER TYPE "ActivityKind" ADD VALUE 'PLAN_CHANGE_REJECTED';
ALTER TYPE "ActivityKind" ADD VALUE 'INVITE_ACCEPTED';
ALTER TYPE "ActivityKind" ADD VALUE 'INVITE_DECLINED';

-- AlterTable
ALTER TABLE "Phase" ADD COLUMN     "plannedDurationDays" INTEGER NOT NULL DEFAULT 7;

-- AlterTable
ALTER TABLE "TemplatePhase" ADD COLUMN     "defaultDurationDays" INTEGER NOT NULL DEFAULT 7;

-- CreateTable
CREATE TABLE "PlanChangeRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "targetApproverRole" "ProjectRole" NOT NULL,
    "type" "PlanChangeType" NOT NULL,
    "payload" JSONB NOT NULL,
    "note" TEXT,
    "status" "ProposalStatus" NOT NULL DEFAULT 'PROPOSED',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanChangeRequest_projectId_status_idx" ON "PlanChangeRequest"("projectId", "status");

-- AddForeignKey
ALTER TABLE "PlanChangeRequest" ADD CONSTRAINT "PlanChangeRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanChangeRequest" ADD CONSTRAINT "PlanChangeRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanChangeRequest" ADD CONSTRAINT "PlanChangeRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
