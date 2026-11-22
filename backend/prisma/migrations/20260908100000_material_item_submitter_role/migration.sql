-- Ai khai báo 1 loại vật tư (MaterialCheckItem) — mặc định MAIN_CONTRACTOR (luồng gốc: thầu tập
-- kết, chủ nhà duyệt). OWNER dùng khi chủ nhà đã có sẵn vật tư (VD mua trước 100 thùng gạch), thầu
-- chính là bên duyệt/tiếp nhận số lượng thay vì chủ nhà — xem MaterialCheckService.decideBatch.
ALTER TABLE "MaterialCheckItem" ADD COLUMN "submittedByRole" "ProjectRole" NOT NULL DEFAULT 'MAIN_CONTRACTOR';
