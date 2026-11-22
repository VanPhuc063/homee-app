-- CreateTable
CREATE TABLE "MaterialLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "reportDate" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DECIMAL(15,0),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialLogPhoto" (
    "id" TEXT NOT NULL,
    "materialLogId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialLogPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialDayNote" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialDayNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_MaterialLogSteps" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "MaterialLog_projectId_reportDate_idx" ON "MaterialLog"("projectId", "reportDate");

-- CreateIndex
CREATE INDEX "MaterialDayNote_projectId_date_idx" ON "MaterialDayNote"("projectId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "_MaterialLogSteps_AB_unique" ON "_MaterialLogSteps"("A", "B");

-- CreateIndex
CREATE INDEX "_MaterialLogSteps_B_index" ON "_MaterialLogSteps"("B");

-- AddForeignKey
ALTER TABLE "MaterialLog" ADD CONSTRAINT "MaterialLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialLog" ADD CONSTRAINT "MaterialLog_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialLogPhoto" ADD CONSTRAINT "MaterialLogPhoto_materialLogId_fkey" FOREIGN KEY ("materialLogId") REFERENCES "MaterialLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialDayNote" ADD CONSTRAINT "MaterialDayNote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialDayNote" ADD CONSTRAINT "MaterialDayNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MaterialLogSteps" ADD CONSTRAINT "_MaterialLogSteps_A_fkey" FOREIGN KEY ("A") REFERENCES "MaterialLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MaterialLogSteps" ADD CONSTRAINT "_MaterialLogSteps_B_fkey" FOREIGN KEY ("B") REFERENCES "Step"("id") ON DELETE CASCADE ON UPDATE CASCADE;
