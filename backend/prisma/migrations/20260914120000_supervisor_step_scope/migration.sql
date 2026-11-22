-- Mời giám sát theo từng bước cụ thể (task-based) — song song với assignedPhaseCodes hiện có
-- (dùng cho thầu phụ). Rỗng ở cả 2 cột = giám sát toàn thời gian/bán thời gian, xem toàn bộ dự án.
ALTER TABLE "ProjectMember" ADD COLUMN "assignedStepIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ProjectInvite" ADD COLUMN "assignedStepIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
