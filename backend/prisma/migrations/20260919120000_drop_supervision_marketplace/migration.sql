-- Bỏ tính năng marketplace thuê giám sát (đăng yêu cầu, báo giá, thanh toán VNPay) theo quyết
-- định sản phẩm 2026-09-19 — chưa có dữ liệu thật (tính năng vừa deploy, chưa có ai dùng), xoá an
-- toàn không cần backfill. Việc mời giám sát trực tiếp (ProjectMember.assignedStepIds) không đụng.
DROP TABLE IF EXISTS "SupervisionPayment";
DROP TABLE IF EXISTS "SupervisionQuote";
DROP TABLE IF EXISTS "SupervisionRequest";
DROP TYPE IF EXISTS "SupervisionPaymentStatus";
DROP TYPE IF EXISTS "SupervisionQuoteStatus";
DROP TYPE IF EXISTS "SupervisionRequestStatus";
