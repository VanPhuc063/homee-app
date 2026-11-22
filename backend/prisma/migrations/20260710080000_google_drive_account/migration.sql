-- Google Drive: tài khoản Drive của chủ nhà dùng để lưu ảnh/video công trình (thay cho R2) +
-- liên kết bắt buộc trên Project lúc tạo (nullable ở DB cho dự án cũ trước tính năng này).

-- CreateTable
CREATE TABLE "GoogleDriveAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "googleUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT NOT NULL,
    "accessToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "rootFolderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleDriveAccount_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "driveAccountId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "GoogleDriveAccount_userId_googleUserId_key" ON "GoogleDriveAccount"("userId", "googleUserId");

-- AddForeignKey
ALTER TABLE "GoogleDriveAccount" ADD CONSTRAINT "GoogleDriveAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_driveAccountId_fkey" FOREIGN KEY ("driveAccountId") REFERENCES "GoogleDriveAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
