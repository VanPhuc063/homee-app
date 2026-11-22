-- CreateEnum
CREATE TYPE "ReportQuality" AS ENUM ('PASSED', 'FAILED');

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "progressPercent" INTEGER,
ADD COLUMN     "qualityDecision" "ReportQuality";

-- CreateTable
CREATE TABLE "DailyWeather" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "tempC" DOUBLE PRECISION NOT NULL,
    "condition" TEXT NOT NULL,
    "rainWindow" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyWeather_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyWeather_projectId_date_key" ON "DailyWeather"("projectId", "date");

-- CreateIndex
CREATE INDEX "Comment_stepId_createdAt_idx" ON "Comment"("stepId", "createdAt");

-- AddForeignKey
ALTER TABLE "DailyWeather" ADD CONSTRAINT "DailyWeather_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
