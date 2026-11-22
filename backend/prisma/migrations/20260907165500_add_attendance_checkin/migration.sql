-- CreateTable: AttendanceCheckIn (chấm công công trường bằng ảnh, 1 check-in/thầu/ngày)
CREATE TABLE "AttendanceCheckIn" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "submittedBy" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "workerCount" INTEGER NOT NULL,
    "objectKey" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceCheckIn_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AttendanceCheckIn_projectId_submittedBy_date_key" ON "AttendanceCheckIn"("projectId", "submittedBy", "date");
CREATE INDEX "AttendanceCheckIn_projectId_date_idx" ON "AttendanceCheckIn"("projectId", "date");

ALTER TABLE "AttendanceCheckIn" ADD CONSTRAINT "AttendanceCheckIn_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceCheckIn" ADD CONSTRAINT "AttendanceCheckIn_submittedBy_fkey" FOREIGN KEY ("submittedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
