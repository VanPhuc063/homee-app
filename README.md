# Homeee — Xây nhà minh bạch

Monorepo MVP: quản lý thi công xây nhà với quy trình bắt buộc + bằng chứng ảnh/video, duyệt 2 lớp (giám sát → chủ nhà), gating ứng tiền theo giai đoạn (app không giữ tiền), và affiliate/bán vật liệu.

## Chạy dự án (local dev)

| Service | Thư mục | Lệnh | Địa chỉ / Ghi chú |
|---|---|---|---|
| PostgreSQL | — | `docker start homee-dev-pg` | `localhost:5432` — chưa có container thì tạo mới, xem `backend/README.md` |
| Backend (NestJS) | `backend/` | `npm run start:dev` | `http://localhost:3000` |
| Mobile (Expo) | `mobile/` | `npx expo start` | Mở bằng **dev client** đã build sẵn (không phải Expo Go — app có native module: image/document picker), xem `mobile/README.md` |
| Mobile — build dev client (lần đầu / sau khi thêm native module mới) | `mobile/` | `npx expo run:android` | Build + cài thẳng lên thiết bị/emulator đang kết nối (cần Android Studio/SDK) |

Lần đầu setup trên máy mới (migrate DB, seed, cài native module, build dev client...) xem chi tiết từng bước ở `backend/README.md` và `mobile/README.md`.

> **Android — nối port cho thiết bị/emulator (mỗi lần cắm lại thiết bị hoặc restart adb):**
> ```bash
> adb reverse tcp:3000 tcp:3000
> ```
> Forward port backend (3000) từ máy tính sang thiết bị, để app gọi `http://localhost:3000` từ điện thoại vẫn trúng đúng backend đang chạy trên máy — không có lệnh này sẽ báo lỗi connect refused. Port 8081 (Metro) thì Expo CLI tự `adb reverse` sẵn, không cần lo.

| Thư mục | Nội dung |
|---|---|
| `docs/PLAN.md` | Toàn bộ kế hoạch: so sánh techstack + đề xuất, kiến trúc, ERD, API, retention/monetization, roadmap |
| `backend/` | NestJS + Prisma + PostgreSQL. Seed sẵn quy trình chuẩn (~21 hạng mục kết cấu thô + hoàn thiện, ~80 bước), lọc theo loại hợp đồng |
| `mobile/` | Expo React Native (iOS + Android): login OTP, timeline thi công, upload bằng chứng, duyệt bước, ứng tiền, mẹo + so sánh giá |

## Techstack (đã chọn — chi tiết lý do trong docs/PLAN.md)

Mobile **Expo React Native + TypeScript** · Backend **NestJS + Prisma** · DB **PostgreSQL (Supabase)** · Media **Cloudflare R2** (presigned upload, egress free) · Push **Expo Notifications** · Deploy **Railway/Fly.io Singapore + EAS**. Cache Redis: thêm sau khi cần (Upstash).
