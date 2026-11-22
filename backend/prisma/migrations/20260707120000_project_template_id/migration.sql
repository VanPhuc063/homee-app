-- Lưu lại template gốc dùng khi tạo dự án, để có thể "thêm lại" 1 hạng mục chuẩn
-- đã bị thầu/chủ nhà bỏ trong lúc lập kế hoạch (feedback: 1 kế hoạch chuẩn, thêm bớt tuỳ ý).

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "templateId" TEXT;
