# Thiết lập IAP (subscription)

Scaffold code đã sẵn sàng (backend verify + mobile purchase flow), nhưng cần làm các bước sau trước
khi mua thật hoạt động được.

## 1. Tạo sản phẩm trên store

Product ID hiện là **placeholder** trong `backend/src/subscription/plan-catalog.ts` — tạo đúng các
ID sau trên cả App Store Connect và Google Play Console (dùng chung 1 bộ ID cho cả 2 nền tảng cho
đơn giản):

| Product ID | Loại | Giá | Ghi chú |
|---|---|---|---|
| `com.homee.owner.monthly` | Auto-renewing subscription | 500.000đ/tháng | |
| `com.homee.owner.6month` | Non-consumable (mua đứt) | 2.800.000đ | Apple không hỗ trợ kỳ hạn 9 tháng cho subscription nên xử lý mua đứt |
| `com.homee.owner.9month` | Non-consumable | 4.000.000đ | |
| `com.homee.owner.12month` | Non-consumable | 5.500.000đ | |
| `com.homee.contractor.monthly` | Auto-renewing subscription | 500.000đ/tháng | |
| `com.homee.contractor.10projects` | Non-consumable | 3.000.000đ | |
| `com.homee.contractor.yearly` | Non-consumable | 10.000.000đ | |
| `com.homee.ai.premium` | Non-consumable | 700.000đ | Vĩnh viễn |

**App Store Connect**: App > Monetization > Subscriptions (2 gói monthly) + In-App Purchases (các
gói còn lại, loại "Non-Consumable").

**Google Play Console**: Monetize > Products > Subscriptions (2 gói monthly, tạo base plan auto-
renewing) + Products > In-app products (các gói còn lại).

Nếu đổi giá/thêm gói, chỉ cần sửa `plan-catalog.ts` — không cần build lại app (mobile đọc giá qua
`GET /me/subscription/plans`), nhưng product ID trên store và trong catalog PHẢI khớp nhau.

## 2. Credential backend

### Apple (App Store Server API)
1. App Store Connect > Users and Access > Integrations > In-App Purchase — tạo key mới, tải file
   `.p8`.
2. Set env trên backend (VPS `.env`):
   - `APPLE_IAP_KEY_ID` — Key ID hiện trên trang tạo key
   - `APPLE_IAP_ISSUER_ID` — Issuer ID hiện ở đầu trang Integrations
   - `APPLE_IAP_PRIVATE_KEY` — nội dung file `.p8` (giữ nguyên `\n`, hoặc escape thành `\\n` nếu để
     trên 1 dòng trong .env)
   - `APPLE_BUNDLE_ID` — bundle ID của app (xem `mobile/app.json` > `ios.bundleIdentifier`, hiện
     app chưa cấu hình bundle ID iOS — cần thêm trước khi build iOS)

### Google (Play Developer API)
1. Google Cloud Console (cùng project với Google Drive OAuth đã dùng) > IAM & Admin > Service
   Accounts — tạo service account mới, tải key JSON.
2. Play Console > Setup > API access — link Cloud project, cấp quyền "Financial data" cho service
   account vừa tạo.
3. Set env trên backend:
   - `GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL` — `client_email` trong file JSON
   - `GOOGLE_PLAY_SERVICE_ACCOUNT_KEY` — `private_key` trong file JSON (giữ `\n`)
   - `GOOGLE_PLAY_PACKAGE_NAME` — `vn.homeee.app` (khớp `mobile/app.json` > `android.package`)

## 3. Test sandbox

1. App Store: thêm Sandbox Tester trong App Store Connect > Users and Access > Sandbox > Testers,
   đăng nhập tài khoản đó trên thiết bị test (Settings > App Store > Sandbox Account).
2. Google Play: thêm tài khoản test vào Play Console > Setup > License testing, upload bản build
   lên 1 track nội bộ (Internal testing) — Play Billing KHÔNG hoạt động với APK cài tay qua `adb
   install`, bắt buộc phải tải qua Play Store (kể cả bản internal testing).
3. Mua thử 1 giao dịch, kiểm tra `SubscriptionService.verifyWithApple`/`verifyWithGoogle` trong log
   backend (`docker logs homee-backend`) — code hiện CHƯA được xác nhận đúng 100% với response thật
   từ 2 API này (viết đúng theo tài liệu nhưng chưa có giao dịch thật để đối chiếu), rất có thể cần
   chỉnh field parse sau lần thử đầu tiên.

## 4. Chưa làm (ngoài scope scaffold này)

- Gating thật: hiện AI vẫn MỞ MIỄN PHÍ cho mọi user (`ai.service.ts` dòng đầu) — subscription mới
  chỉ dừng ở ghi nhận trạng thái, CHƯA có chỗ nào thực sự khoá tính năng theo gói. Cần quyết định rõ
  tính năng nào khoá theo plan nào rồi mới thêm guard.
- Webhook gia hạn/huỷ tự động (App Store Server Notifications V2 / Google RTDN qua Pub/Sub) — hiện
  trạng thái chỉ cập nhật khi app gọi `verify` sau mỗi lần mua, không tự nhận biết khi subscription
  bị huỷ/hết hạn/hoàn tiền từ phía store.
- Màn "Restore purchases" (khôi phục giao dịch khi cài lại app/đổi máy) — thư viện đã có sẵn API
  (`getAvailablePurchases`/`restorePurchases` trong `useIAP`) nhưng chưa wire vào UI.
- Bundle ID iOS chưa cấu hình trong `app.json` — cần thêm trước khi build/test trên iOS.
