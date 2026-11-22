# Affiliate (referral flat 1 tầng)

Không cần thiết lập gì thêm — mọi user tự có mã giới thiệu ngay lúc tạo tài khoản, không có khái
niệm founder/CTV cần đăng ký-duyệt.

## Cách hoạt động

- Mỗi `User` có `referralCode` (8 ký tự, tự sinh lúc tạo tài khoản — xem
  `AffiliateService.generateReferralCode`, gọi từ `AuthService.requestOtp`).
- User mới nhập mã này vào ô "Mã giới thiệu" ở màn đăng nhập (`login.tsx`) → gắn `referredById`
  **1 lần duy nhất, vĩnh viễn** lúc gọi `POST /auth/otp/request` (`AffiliateService.maybeAttachReferral`).
  Không có cơ chế đổi lại sau khi đã gắn.
- Hoa hồng: khi người được giới thiệu mua gói subscription, người giới thiệu nhận
  `REFERRAL_RATE` (mặc định 10%, đổi ở `affiliate.service.ts`) của giá gói — tính tự động trong
  `SubscriptionService.verifyPurchase` → `AffiliateService.recordCommission`. Chỉ 1 tầng (người
  giới thiệu trực tiếp), không chia tiếp cho tầng trên.
- Rút tiền: request-only (`Withdrawal` record trạng thái `PENDING`), **chưa có luồng chuyển khoản
  tự động** — admin xử lý thủ công rồi tự cập nhật `status` qua DB (chưa có API admin duyệt).

## Màn hình mobile

`app/affiliate/index.tsx` — "Giới thiệu bạn bè": mã + link + QR (ảnh QR tạo qua
`api.qrserver.com`, không cần native module), nút chia sẻ, thống kê (số người đã giới thiệu, tổng
hoa hồng, số dư có thể rút), nút rút tiền, danh sách người đã giới thiệu.

## Chưa làm (ngoài scope)

- Không có API/UI cho admin duyệt/đổi trạng thái `Withdrawal`.
- Chưa validate race condition nếu 2 request rút tiền cùng lúc (check số dư ở `requestWithdrawal`
  không có transaction lock).
- Chưa có deep link `homeee://ref/<code>` để tự điền mã khi mở link chia sẻ — user phải tự gõ tay.
