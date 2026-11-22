-- CreateTable
CREATE TABLE "WorkforceReport" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "sentById" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "presentCount" INTEGER NOT NULL,
    "totalCount" INTEGER NOT NULL,

    CONSTRAINT "WorkforceReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkforceReportPhoto" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkforceReportPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkforceReport_projectId_date_key" ON "WorkforceReport"("projectId", "date");

-- AddForeignKey
ALTER TABLE "WorkforceReport" ADD CONSTRAINT "WorkforceReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkforceReport" ADD CONSTRAINT "WorkforceReport_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkforceReportPhoto" ADD CONSTRAINT "WorkforceReportPhoto_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "WorkforceReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

