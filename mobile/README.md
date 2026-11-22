# Homeee Mobile — Expo React Native (iOS + Android)

## Chạy local

```bash
cd mobile
npm install
npx expo start        # quét QR bằng app Expo Go trên điện thoại
```

Backend mặc định trỏ `https://api.homee.cristhedev.com` (production trên VPS). Khi dev local, sửa `extra.apiUrl` trong `app.json` sang backend local — dùng IP LAN của máy khi test trên điện thoại thật, VD `http://192.168.1.10:3000`.

## Màn hình

Bottom tab (`app/(tabs)/`):

- `index` (tab Công trình) — danh sách công trình, tạo dự án (tự sinh hạng mục chuẩn theo loại hợp đồng)
- `compare` (tab So sánh giá) — tìm kiếm + lọc theo danh mục, so sánh giá vật tư đa nhà cung cấp (kể cả Shopee) trung lập, không ưu tiên nguồn nào; kèm feed mẹo xây nhà
- `explore` (tab Khám phá) — duyệt thầu/giám sát đã bật "Sẵn sàng nhận việc", lọc theo vai trò + tìm theo tên, chỉ thấy điểm đánh giá TB + số dự án hoàn thành (không lộ SĐT/tên dự án cụ thể)
- `profile` (tab Hồ sơ) — sửa tên, danh sách công trình + vai trò, lời mời từ Khám phá đang chờ (chấp nhận/từ chối), hồ sơ hành nghề (bật "Sẵn sàng nhận việc" + vai trò nhận việc + khu vực + giới thiệu), tài khoản Google Drive, đăng xuất

Stack screens theo ngữ cảnh 1 dự án (push từ tab Công trình):

- `login` — đăng nhập SĐT + OTP (dev: OTP luôn `000000`)
- `project/[id]` — có tab bar riêng (`app/project/[id]/_layout.tsx`) với 3 mục luôn có ý nghĩa bất kể trạng thái dự án:
  - `project/[id]/index` (Tiến độ) — badge trạng thái dự án, nút hành động theo ngữ cảnh (Kế hoạch thi công chỉ hiện lúc PLANNING, Ứng tiền/Lỗi chỉ hiện khi đã ACTIVE trở lên, Duyệt vật tư theo contractType), timeline hạng mục + bước
  - `project/[id]/members` — danh sách + mời thành viên, gán hạng mục cho thầu phụ
  - `project/[id]/diary` — nhật ký thi công (tự ghi theo sự kiện + ghi chú tay)
- `step/[id]` — chụp/upload ảnh video bằng chứng, nộp bước, duyệt/từ chối theo vai trò, xem ảnh/video full màn hình + bình luận theo từng tấm, trao đổi chung
- `payments/[projectId]` — tạo đợt ứng tiền gắn mốc hạng mục (owner/thầu chính khi PLANNING), trạng thái gating, chủ nhà xác nhận đã chuyển
- `defects/[projectId]` — ghi nhận lỗi (owner/giám sát), thầu xác nhận đã sửa, owner/giám sát đóng lỗi — chặn gating ứng tiền khi còn lỗi mở
- `plan/[projectId]` — màn Kế hoạch thi công gộp chung: thầu chính/chủ nhà thêm-xoá cả hạng mục lẫn bước thương lượng (bước bắt buộc không thể xóa), thêm lại hạng mục chuẩn đã bỏ, tạo hạng mục tuỳ chỉnh, và chủ nhà duyệt kế hoạch ngay tại đây khi đã sẵn sàng
- `material-check/[projectId]` — cổng duyệt vật tư tập kết trước thi công
- `candidate/[id]` — hồ sơ công khai 1 ứng viên từ tab Khám phá (điểm đánh giá, kinh nghiệm, giới thiệu) + form "Mời vào dự án" (chọn dự án mình làm chủ nhà, vai trò, hạng mục nếu là thầu phụ) — gửi lời mời cần ứng viên chấp nhận mới thành thành viên thật
- `review/[projectId]` — chủ nhà đánh giá 1-5 sao + nhận xét từng thành viên sau khi dự án đã DONE, chỉ hiện được sau khi hoàn thành, mỗi người 1 lần
- `notifications` — danh sách thông báo trong app (đã đọc/chưa đọc, thời gian tương đối), mở từ icon chuông ở header mọi tab chính

Ngoài route, còn 2 thành phần luôn chạy nền khi đã đăng nhập: `InvitePopup` (modal tự hiện khi vừa mở app nếu có lời mời PENDING, cho chấp nhận/từ chối ngay) và `NotificationBell` (icon chuông + số chưa đọc ở header, poll mỗi 30s) — cả hai ở `mobile/src/components/`.

## Build production

```bash
npm install -g eas-cli
eas build --platform all     # cần tài khoản Expo (free) + Apple Developer ($99/năm) cho iOS
eas update                   # OTA update không cần chờ store review
```
