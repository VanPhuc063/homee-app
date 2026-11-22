-- "Book giám sát": mỗi lần giám sát nghiệm thu (duyệt bước) phải chụp ảnh thiết bị đo dùng để
-- kiểm tra, làm bằng chứng cho chủ đầu tư. Chỉ bắt buộc ở tầng service cho level=SUPERVISOR, cột
-- để null với duyệt của OWNER.
ALTER TABLE "Approval" ADD COLUMN "equipmentPhotoKey" TEXT;
