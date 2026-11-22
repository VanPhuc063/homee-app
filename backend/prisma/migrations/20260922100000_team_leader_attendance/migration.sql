-- CreateEnum: TeamType (7 loại đội — Requirements v2.1 §4.5.3)
CREATE TYPE "TeamType" AS ENUM ('PHAN_THO', 'SON', 'THACH_CAO', 'DA', 'KINH_CAU_THANG', 'CUA_NHOM', 'KHAC');

-- AlterTable: gắn loại đội cho lời mời/thành viên SUB_CONTRACTOR đứng vai đội trưởng
ALTER TABLE "ProjectInvite" ADD COLUMN "teamType" "TeamType";
ALTER TABLE "ProjectMember" ADD COLUMN "teamType" "TeamType";

-- CreateTable: TeamWorker (thợ trong 1 đội, không cần tài khoản)
CREATE TABLE "TeamWorker" (
    "id" TEXT NOT NULL,
    "projectMemberId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamWorker_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TeamAttendance (điểm danh 1 thợ/1 ngày)
CREATE TABLE "TeamAttendance" (
    "id" TEXT NOT NULL,
    "teamWorkerId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "present" BOOLEAN NOT NULL,
    "absenceReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TeamDailyReport (báo cáo công việc hàng ngày của đội trưởng)
CREATE TABLE "TeamDailyReport" (
    "id" TEXT NOT NULL,
    "projectMemberId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "workDone" TEXT NOT NULL,
    "planTomorrow" TEXT,
    "issues" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamDailyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TeamReportMedia (ảnh/video đính kèm báo cáo đội trưởng)
CREATE TABLE "TeamReportMedia" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "type" "EvidenceType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamReportMedia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TeamAttendance_teamWorkerId_date_key" ON "TeamAttendance"("teamWorkerId", "date");
CREATE UNIQUE INDEX "TeamDailyReport_projectMemberId_date_key" ON "TeamDailyReport"("projectMemberId", "date");

ALTER TABLE "TeamWorker" ADD CONSTRAINT "TeamWorker_projectMemberId_fkey" FOREIGN KEY ("projectMemberId") REFERENCES "ProjectMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamAttendance" ADD CONSTRAINT "TeamAttendance_teamWorkerId_fkey" FOREIGN KEY ("teamWorkerId") REFERENCES "TeamWorker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamDailyReport" ADD CONSTRAINT "TeamDailyReport_projectMemberId_fkey" FOREIGN KEY ("projectMemberId") REFERENCES "ProjectMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamReportMedia" ADD CONSTRAINT "TeamReportMedia_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "TeamDailyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
