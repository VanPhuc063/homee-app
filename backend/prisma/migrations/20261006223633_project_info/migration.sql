-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "buildingType" TEXT,
ADD COLUMN     "expectedEndDate" TIMESTAMP(3),
ADD COLUMN     "expectedStartDate" TIMESTAMP(3),
ADD COLUMN     "floors" TEXT;

