-- AlterEnum
ALTER TYPE "ActivityKind" ADD VALUE 'PHASE_REORDERED';

-- AlterEnum
ALTER TYPE "PlanChangeType" ADD VALUE 'REORDER_PHASES';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "constructionStartDate" TIMESTAMP(3);
