-- Nhãn tầng mặc định cho bước "lặp theo tầng" (VD B-12/B-13/B-14 Tầng trệt/Lầu 1) — mirror
-- Step.floorLabel đã có sẵn, để chủ nhà bấm "+" nhân bản thêm tầng ngay trong Plan editor.
ALTER TABLE "TemplateStep" ADD COLUMN "floorLabel" TEXT;
