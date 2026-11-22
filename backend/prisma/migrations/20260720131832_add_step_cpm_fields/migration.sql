-- CreateEnum
CREATE TYPE "StepRelationType" AS ENUM ('FS', 'FF');

-- AlterTable
ALTER TABLE "Step" ADD COLUMN     "baselineEnd" TIMESTAMP(3),
ADD COLUMN     "baselineStart" TIMESTAMP(3),
ADD COLUMN     "durationDays" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "floorLabel" TEXT,
ADD COLUMN     "lagDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "predecessorRelation" "StepRelationType" NOT NULL DEFAULT 'FS',
ADD COLUMN     "predecessorStepId" TEXT;

-- CreateIndex
CREATE INDEX "Step_predecessorStepId_idx" ON "Step"("predecessorStepId");

-- AddForeignKey
ALTER TABLE "Step" ADD CONSTRAINT "Step_predecessorStepId_fkey" FOREIGN KEY ("predecessorStepId") REFERENCES "Step"("id") ON DELETE SET NULL ON UPDATE CASCADE;
