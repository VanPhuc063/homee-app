# HOMEEE — Nền tảng quản lý & minh bạch hóa xây nhà

Tài liệu kế hoạch kỹ thuật + sản phẩm. Phiên bản 1.0 — 07/2026.

---

## 1. Tóm tắt sản phẩm

Nỗi đau của chủ nhà (chủ đầu tư cá nhân): không biết thầu làm đúng kỹ thuật không, không kiểm soát được tiến độ, ứng tiền xong việc cũ chưa xong, không có bằng chứng khi tranh chấp.

Homeee giải quyết bằng 3 cơ chế:

1. **Quy trình bắt buộc có bằng chứng**: mỗi hạng mục thi công gồm các bước chuẩn (seed từ file quy trình XA — hạng mục kết cấu thô + hoàn thiện, lọc theo loại hợp đồng của từng dự án). Thầu phải upload ảnh/video từng bước, giám sát comment từng hình, chủ nhà duyệt — mới mở khóa bước tiếp theo. Toàn bộ ảnh lưu vĩnh viễn làm "hồ sơ ngôi nhà".
2. **Gating ứng tiền theo giai đoạn**: app KHÔNG giữ tiền, không nhận tiền user (tránh rủi ro pháp lý). App chỉ tính và hiển thị trạng thái "đủ điều kiện ứng đợt N": tất cả bước của giai đoạn trước + defect cũ phải được duyệt xong. Chủ nhà tự chuyển tiền ngoài app, bấm xác nhận đã ứng.
3. **Monetization không thu phí app, không tự bán hàng**: so sánh giá vật tư trung lập giữa nhiều nhà cung cấp + sàn TMĐT (Shopee...) — không ưu tiên hiển thị bất kỳ nguồn nào — kết hợp đề xuất của thầu và feed mẹo xây nhà. App chỉ giới thiệu, ăn hoa hồng khi khách bấm mua ở nguồn họ tự chọn (không giữ hàng, không giữ tiền). Doanh thu đến từ chiết khấu/hoa hồng trên đơn hàng phát sinh quanh vòng đời xây nhà + sau bàn giao.

### Vai trò người dùng

| Chức năng | Chủ nhà | Thầu chính | Thầu phụ | Giám sát |
|---|---|---|---|---|
| Tạo dự án, mời thành viên | ✅ | ❌ | ❌ | ❌ |
| Lập kế hoạch: thêm/bớt cả hạng mục lẫn bước thương lượng | ✅ | ✅ | ❌ | góp ý |
| Duyệt kế hoạch cuối (chuyển ACTIVE) | ✅ | ❌ | ❌ | ❌ |
| Bỏ bước bắt buộc trong 1 hạng mục đã chọn | ❌ | ❌ | ❌ | ❌ |
| Upload ảnh/video bằng chứng bước | ❌ | ✅ | ✅ (hạng mục được gán) | ❌ |
| Comment vào từng ảnh | ✅ | ✅ | ✅ | ✅ |
| Duyệt bước (lớp 1) | ❌ | ❌ | ❌ | ✅ |
| Duyệt bước (lớp 2 - chốt) | ✅ | ❌ | ❌ | ❌ |
| Xác nhận đã ứng tiền đợt N | ✅ | yêu cầu | ❌ | ❌ |
| Propose vật liệu/nội thất từ catalog | ❌ | ✅ | ✅ | ❌ |
| Chốt vật liệu | ✅ | ❌ | ❌ | ❌ |
| Tạo/đóng defect | ✅ | đóng | sửa | ✅ tạo |
| **Xem tab Ứng tiền** | ✅ | ✅ | ❌ ẩn hẳn | ❌ ẩn hẳn |
| **Xem tab Tiến độ** | ✅ toàn bộ | ✅ toàn bộ | chỉ hạng mục được gán | ✅ toàn bộ |
| **Xem SĐT thành viên khác** | ✅ | ✅ | ❌ chỉ thấy tên | ❌ chỉ thấy tên |

Thầu chính: chịu trách nhiệm toàn bộ tiến độ, phân công hạng mục cho thầu phụ, yêu cầu ứng tiền. Thầu phụ: chỉ thấy và cập nhật hạng mục mình được gán (cửa, MEP, trần...).

Ngoài phân quyền THAO TÁC (bảng trên), 3 dòng in đậm là phân quyền HIỂN THỊ — chặn ở tầng API
(`ProjectsService.listMine/getPhases`, `PaymentsService.list`), không chỉ ẩn nút ở mobile. Ứng
tiền là thoả thuận tài chính riêng chủ nhà–thầu chính nên ẩn hẳn với thầu phụ/giám sát; các module
còn lại (Lỗi, Kế hoạch, Duyệt vật tư, Nhật ký) vẫn theo nguyên tắc minh bạch mặc định — mọi thành
viên xem được, chỉ đúng vai trò mới thao tác.

### Khám phá thầu/giám sát + đánh giá uy tín

Dành cho chủ nhà chưa quen thầu/giám sát cụ thể nào. Cơ chế:

- **Opt-in, không tự động**: thầu/giám sát tự bật "Sẵn sàng nhận việc" ở Hồ sơ
  (`User.availableForHire`, mặc định false) mới hiện diện ở tab Khám phá — tránh lộ thông tin
  người không muốn được tìm thấy.
- **Hồ sơ công khai chỉ lộ số liệu tổng hợp**: điểm đánh giá trung bình + số dự án đã hoàn thành
  theo từng vai trò (`DirectoryService`). KHÔNG hiện tên/địa chỉ công trình cụ thể, KHÔNG hiện
  SĐT — tránh lộ thông tin của các chủ nhà cũ. SĐT chỉ trao đổi được sau khi cả 2 bên đã cùng
  tham gia 1 dự án (qua ProjectMember).
- **Mọi lời mời đều cần chấp nhận** (`ProjectInvite`) — kể cả mời bằng SĐT quen biết ở tab Thành
  viên (`ProjectsService.addMember`) lẫn mời từ hồ sơ ứng viên ở Khám phá (`InvitesService.send`):
  tạo lời mời PENDING → người được mời thấy ở đầu trang Hồ sơ, chấp nhận mới chính thức thành
  `ProjectMember`, từ chối thì thôi. Không còn kiểu "thêm thẳng" như trước — người được mời luôn
  phải tự đăng nhập và đồng ý mới vào dự án, dù chủ nhà có quen họ ngoài đời hay không. Ngoại lệ:
  đổi vai trò của người ĐÃ là thành viên chính thức thì áp dụng ngay, không cần chấp nhận lại.
- **Đánh giá 1 chiều, 1 lần/thành viên/dự án**: chỉ chủ nhà đánh giá (1-5 sao + nhận xét) sau khi
  dự án đã DONE, không sửa lại được (`Review`, giống Grab/Shopee). Nhận xét chỉ người được đánh
  giá thấy (`GET /me/reviews`); điểm trung bình mới lộ công khai ở tab Khám phá.
- **Popup lời mời khi vừa mở app**: nếu có `ProjectInvite` PENDING, ngay khi vừa đăng nhập hoặc
  vừa mở lại app (còn phiên đăng nhập cũ) sẽ hiện modal liệt kê các lời mời + nút Chấp
  nhận/Từ chối ngay tại chỗ (`InvitePopup`, `mobile/src/components/InvitePopup.tsx`) — không bắt
  người dùng phải tự mò vào Hồ sơ mới biết có lời mời mới. Bấm "Để sau" chỉ ẩn tạm trong phiên
  hiện tại; lời mời vẫn còn nguyên ở mục "Lời mời tham gia dự án" trong Hồ sơ.

### Thông báo trong app (Notification Center)

- **Model `Notification`** (mới): mọi thông báo (lời mời, bước bị duyệt/từ chối, ứng tiền đủ điều
  kiện, vật tư được duyệt...) đều được ghi thường trực vào DB qua `NotificationsService`, kèm
  trạng thái `read`/`unread` và `createdAt` — khác với push (Expo), vốn chỉ gửi được khi có
  `pushToken` và không giữ lịch sử. Vì vậy `notifyUser`/`notifyProject` giờ luôn ghi DB trước, rồi
  mới thử gửi push nếu user có token — không phụ thuộc quyền push.
- **API**: `GET /me/notifications` (100 bản ghi gần nhất, mới nhất trước), `GET
  /me/notifications/unread-count`, `PATCH /me/notifications/:id/read`, `PATCH
  /me/notifications/read-all`.
- **Mobile**: icon chuông ở header mọi tab chính (`NotificationBell`, poll unread-count mỗi 30s,
  hiện số chưa đọc) → mở màn `app/notifications.tsx` — danh sách có phân biệt đã đọc/chưa đọc
  (chấm + nền tint), thời gian tương đối kiểu "5 phút trước"/"Hôm qua" (`src/time.ts`), bấm vào 1
  thông báo để đánh dấu đã đọc, hoặc "Đánh dấu tất cả đã đọc".
- **Bấm vào thông báo → điều hướng đúng màn**: mỗi lời gọi `notifyProject`/`notifyUser` kèm `type`
  + `data` (id liên quan, VD `stepId`/`projectId`) — mobile map sang route qua
  `src/notificationRoutes.ts` (`resolveNotificationRoute`), hiện chevron ở thông báo nào điều
  hướng được. Bảng loại hiện có:

  | `type` | Route |
  |---|---|
  | `STEP_SUBMITTED` / `STEP_REJECTED` / `STEP_APPROVED` | `/step/:stepId` |
  | `DEFECT_CREATED` / `DEFECT_UPDATED` | `/defects/:projectId` |
  | `MATERIAL_CHECK_SUBMITTED` / `MATERIAL_CHECK_DECIDED` | `/material-check/:projectId` |
  | `PAYMENT_CONFIRMED` / `PAYMENT_ELIGIBLE` | `/payments/:projectId` |
  | `PLAN_APPROVED` / `PROPOSAL_CREATED` / `PROPOSAL_DECIDED` | `/project/:projectId` (2 loại đề
    xuất vật liệu tạm trỏ về đây vì chưa có màn Đề xuất vật liệu riêng ở mobile) |
  | `INVITE_ACCEPTED` / `INVITE_DECLINED` | `/project/:projectId/members` |
  | `INVITE_RECEIVED` / `REVIEW_RECEIVED` | `/profile` |

  Toàn bộ điểm phát thông báo trong hệ thống (đã soát lại toàn bộ, bổ sung các chỗ trước đây im
  lặng): nộp/duyệt/từ chối bước, tạo/sửa/đóng lỗi, nộp/duyệt/từ chối vật tư tập kết, xác nhận ứng
  tiền, đợt ứng tiền chuyển ELIGIBLE, duyệt kế hoạch, mời thành viên (SĐT hoặc Khám phá), chấp
  nhận/từ chối lời mời, đề xuất vật liệu mới/được chốt, nhận được đánh giá sau dự án DONE.

### Business flow chính

```
Chủ nhà tạo dự án ──► mời thầu chính, giám sát, thầu phụ (link/SĐT)
        │
Dự án khởi tạo sẵn 1 kế hoạch chuẩn (toàn bộ hạng mục + bước của template, đều LOCKED)
        │
Thầu chính hoặc chủ nhà lập kế hoạch: thêm/bớt cả HẠNG MỤC (vd bỏ "Đào móng" nếu chỉ cải
tạo) lẫn bước THƯƠNG LƯỢNG trong hạng mục đã chọn (bước MANDATORY không xóa được)
──► gắn các đợt ứng tiền vào mốc giai đoạn
        │
Chủ nhà DUYỆT kế hoạch ──► dự án chuyển trạng thái ACTIVE
        │
Vòng lặp mỗi bước:
  Thầu upload ≥ minPhotos ảnh (+video nếu yêu cầu)
  ──► Giám sát comment từng ảnh, APPROVE/REJECT (reject = kèm lý do, thầu làm lại)
  ──► Chủ nhà APPROVE ──► bước DONE, bước kế tiếp UNLOCKED
        │
Hết giai đoạn + không còn defect mở ──► đợt ứng tiền ELIGIBLE
  ──► chủ nhà chuyển tiền NGOÀI app ──► bấm "đã ứng" ──► giai đoạn sau tiếp tục
        │
Bàn giao: defect = 0 ──► biên bản bàn giao ──► hồ sơ ngôi nhà lưu vĩnh viễn
```

### Retention — giữ user ở trong app hằng ngày

- Push notification mỗi khi có ảnh mới/comment/bước chờ duyệt → chủ nhà mở app nhiều lần/ngày trong suốt 6–12 tháng xây.
- Daily digest 19h: "Hôm nay công trình của bạn có 12 ảnh mới, 2 bước chờ bạn duyệt".
- Feed "Mẹo xây nhà" theo đúng giai đoạn đang thi công (đang chống thấm → mẹo chống thấm + sản phẩm liên quan).
- So sánh giá: sản phẩm mình bán đặt cạnh nút link Shopee (ăn affiliate cả 2 chiều) — khách tự so, tin tưởng tăng.
- Sau bàn giao: hồ sơ ngôi nhà (tra lại ống nước âm tường ở đâu), nhắc lịch bảo trì (vệ sinh máy lạnh, chống thấm định kỳ) → mỗi lần nhắc là 1 cơ hội bán đồ/dịch vụ.

---

## 2. Lựa chọn techstack

### 2.1 Mobile (iOS + Android, ưu tiên UI/UX mượt)

| Tiêu chí | React Native (Expo) ⭐ đề xuất | Flutter | Native (Swift/Kotlin) |
|---|---|---|---|
| Hiệu năng UI | Rất tốt từ RN 0.76+ (New Architecture, Fabric); 60fps cho app CRUD+media | Xuất sắc, ổn định nhất | Tốt nhất |
| Tốc độ dev solo + AI | **Nhanh nhất**: TS xuyên suốt FE/BE, Expo Router, OTA update (EAS Update) sửa bug không cần chờ store review | Nhanh, nhưng Dart tách khỏi backend TS | Chậm, x2 codebase |
| Tuyển dev VN | Dễ nhất | Dễ | Khó, đắt |
| Ecosystem media/upload | expo-image (cực nhanh), expo-camera, background upload | Tốt | Tốt |
| Bạn đã biết | ✅ JS/TS | ❌ | ❌ |

**Đề xuất: Expo React Native + TypeScript.** Lý do quyết định: 1 ngôn ngữ cho toàn hệ thống → AI hỗ trợ hiệu quả nhất, bạn review được mọi dòng code; EAS Build/Update cho phép ship iOS+Android không cần máy Mac riêng và đẩy fix tức thì. Flutter chỉ thắng khi cần animation phức tạp kiểu game — app này là workflow + media, không cần.

Bộ thư viện: Expo Router (điều hướng), TanStack Query (server state + cache + offline retry), Zustand (client state), expo-image, react-native-reanimated (animation mượt), FlashList (list ảnh lớn), expo-notifications.

### 2.2 Backend

| Tiêu chí | NestJS + Prisma ⭐ đề xuất | Supabase-only (BaaS) | Spring Boot | Firebase |
|---|---|---|---|---|
| Phù hợp business logic phức tạp (gating bước, duyệt 2 lớp) | ✅ kiểm soát full | ⚠️ logic nhét vào RLS/Edge Functions, khó maintain | ✅ | ⚠️ NoSQL khó cho dữ liệu quan hệ nặng |
| Quen thuộc với bạn | ✅ TS + kiến trúc giống Spring (DI, decorator, module) | — | ✅ nhưng tách ngôn ngữ với mobile | — |
| Chi phí đầu | Free tier (Railway/Fly.io ~$5/th) | Free | VPS + JVM ăn RAM | Free→đắt khi scale |
| Tuyển dev VN | Rất dễ | — | Dễ | — |

**Đề xuất: NestJS + Prisma ORM, chạy monolith.** Workflow engine (bước chặn, điều kiện ứng tiền) là core value — phải nằm trong code backend do mình kiểm soát, không phải trong rules của BaaS. NestJS cho bạn cảm giác Spring Boot nhưng bằng TS. Monolith module hóa; chưa cần microservices.

### 2.3 Database, cache, storage, hạ tầng

| Thành phần | Chọn | Lý do |
|---|---|---|
| Database | **PostgreSQL (Supabase managed)** | Dữ liệu quan hệ nặng (dự án→giai đoạn→bước→ảnh→duyệt). Free tier đủ MVP; sau này migrate connection string là xong. |
| ORM | Prisma | Type-safe, migration tốt, AI viết chuẩn |
| Cache | **Chưa cần lúc MVP** → Upstash Redis khi cần | Quy mô đầu: Postgres index + TanStack Query cache phía client là đủ. Thêm Redis khi có feed/leaderboard/rate-limit. Đừng thêm sớm — thêm moving part cho solo dev là nợ vận hành. |
| Ảnh/video | **Cloudflare R2 + presigned URL upload thẳng từ app** | Media là chi phí lớn nhất của app này. R2: $0.015/GB/tháng, **egress miễn phí** (Supabase Storage/S3 tính phí băng thông ra — chết tiền khi chủ nhà xem ảnh cả ngày). Ảnh nén client-side (~300KB/ảnh), video giới hạn 60s 720p. |
| CDN ảnh | Cloudflare (đi kèm R2) + biến thể thumbnail | Ảnh load tức thì trong app |
| Push | Expo Push Notifications (bọc FCM/APNs) | 1 API cho cả 2 nền tảng, free |
| Auth | JWT (access+refresh) tự quản trong NestJS, OTP SMS qua eSMS/Twilio Verify | User là thầu/thợ — đăng nhập SĐT + OTP là chuẩn VN |
| Hosting API | Railway hoặc Fly.io (Singapore) | Deploy từ Git, ~$5-10/tháng, latency VN→SG ~30-40ms |
| CI/CD mobile | EAS Build + EAS Update | OTA update JS bundle không cần store review |
| Monitoring | Sentry (free tier) | Bắt crash cả mobile lẫn API |

Chi phí vận hành MVP: **~$10–25/tháng** cho tới vài nghìn user.

### 2.4 Kiến trúc tổng thể

```
┌─────────────── Mobile (Expo RN, iOS+Android) ───────────────┐
│ Expo Router · TanStack Query (cache+offline) · Zustand      │
│ Nén ảnh client → upload thẳng R2 bằng presigned URL         │
└───────────────┬─────────────────────────────────────────────┘
                │ HTTPS/JSON (REST)
┌───────────────▼─────────────── NestJS API (Railway/Fly SG) ─┐
│ Auth(OTP+JWT) │ Projects │ Workflow Engine │ Payments-gate  │
│ Content/Affiliate │ Notifications │ Storage(presign)        │
└──┬──────────────┬───────────────┬───────────────────────────┘
   │ Prisma       │ presign       │ Expo Push
┌──▼──────────┐ ┌─▼────────────┐ ┌▼─────────────┐
│ Supabase    │ │ Cloudflare   │ │ FCM / APNs   │
│ PostgreSQL  │ │ R2 + CDN     │ │              │
└─────────────┘ └──────────────┘ └──────────────┘
(Redis/Upstash: thêm sau khi cần · Sentry: monitoring)
```

Điểm thiết kế quan trọng cho công trường sóng yếu: upload queue phía client (ảnh chụp được xếp hàng, tự retry khi có mạng), ảnh nén trước khi gửi, API idempotent.

---

## 3. Thiết kế dữ liệu (ERD)

```mermaid
erDiagram
  User ||--o{ ProjectMember : "tham gia"
  Project ||--o{ ProjectMember : "có"
  Project ||--o{ Phase : "gồm"
  Phase ||--o{ Step : "gồm"
  Step ||--o{ Evidence : "bằng chứng"
  Step ||--o{ Approval : "duyệt"
  Step ||--o{ Comment : ""
  Evidence ||--o{ Comment : "comment từng ảnh"
  Project ||--o{ PaymentStage : "đợt ứng tiền"
  PaymentStage }o--|| Phase : "gắn mốc"
  Project ||--o{ Defect : ""
  Project ||--o{ MaterialProposal : "đề xuất vật liệu"
  Product ||--o{ ProductOffer : "báo giá đa nhà cung cấp"
  Supplier ||--o{ ProductOffer : ""
  ProductOffer ||--o{ MaterialProposal : ""
  ProcessTemplate ||--o{ TemplatePhase : ""
  TemplatePhase ||--o{ TemplateStep : ""
  Project ||--o| MaterialCheck : "cổng duyệt vật tư"
  MaterialCheck ||--o{ MaterialCheckItem : "1 loại vật tư"
  MaterialCheckItem ||--o{ MaterialCheckPhoto : ""
  Project ||--o{ ActivityLog : "nhật ký thi công"
  User ||--o{ GoogleDriveAccount : "kết nối"
  GoogleDriveAccount ||--o{ Project : "lưu media cho"

  User { uuid id PK; string phone UK; string name; string role "global role"; string avatarUrl; string pushToken "Expo push token" }
  ProjectMember { uuid id PK; uuid projectId FK; uuid userId FK; enum role "OWNER|MAIN_CONTRACTOR|SUB_CONTRACTOR|SUPERVISOR"; string[] assignedPhaseCodes "thầu phụ" }
  Project { uuid id PK; string name; string address; enum status "DRAFT|PLANNING|ACTIVE|HANDOVER|DONE"; enum contractType "THO_VA_NHAN_CONG_HOAN_THIEN|TRON_GOI_A_Z|CAI_TAO|CHUNG_CU|NHAN_CONG"; uuid templateId; uuid driveAccountId FK "nullable ở DB, bắt buộc lúc tạo mới" }
  GoogleDriveAccount { uuid id PK; uuid userId FK; string googleUserId; string email; string refreshTokenEncrypted "AES-256-GCM"; string accessToken "cache"; datetime accessTokenExpiresAt; string rootFolderId "cache folder Homee" }
  MaterialCheck { uuid id PK; uuid projectId FK UK; enum status "PENDING|SUBMITTED|APPROVED|REJECTED"; text note; datetime submittedAt; datetime decidedAt; uuid decidedById "cổng bắt buộc trước approvePlan khi contractType != NHAN_CONG — status suy ra tự động từ trạng thái các item, xem bất biến 7" }
  MaterialCheckItem { uuid id PK; uuid materialCheckId FK; string label UK "VD: Thép Việt-Nhật, cùng materialCheckId"; enum status "PENDING|APPROVED|REJECTED — duyệt/từ chối riêng từng loại"; text note "lý do từ chối"; datetime decidedAt; uuid decidedById }
  MaterialCheckPhoto { uuid id PK; uuid itemId FK; uuid uploaderId FK; string objectKey "Drive fileId" }
  ActivityLog { uuid id PK; uuid projectId FK; uuid actorId FK "nullable"; enum kind "NOTE|STEP_SUBMITTED|STEP_APPROVED|...|MATERIAL_CHECK_DECIDED"; text message; uuid stepId "nullable" }
  Phase { uuid id PK; uuid projectId FK; string code; int order; string name; enum status "LOCKED|IN_PROGRESS|DONE" }
  Step { uuid id PK; uuid phaseId FK; int order; string name; text acceptance; bool mandatory "true=không xóa được"; int minPhotos; bool requiresVideo; enum status "LOCKED|OPEN|SUBMITTED|SUPERVISOR_APPROVED|APPROVED|REJECTED" }
  Evidence { uuid id PK; uuid stepId FK; uuid uploaderId FK; enum type "PHOTO|VIDEO"; string objectKey "Drive fileId (dữ liệu cũ trước tính năng Drive vẫn là R2 key)"; string thumbKey; datetime takenAt; json exif }
  Approval { uuid id PK; uuid stepId FK; uuid approverId FK; enum level "SUPERVISOR|OWNER"; enum decision "APPROVED|REJECTED"; text note }
  Comment { uuid id PK; uuid stepId FK; uuid evidenceId FK "nullable"; uuid authorId FK; text body }
  PaymentStage { uuid id PK; uuid projectId FK; int order; string name; decimal amount; uuid unlockAfterPhaseId FK; enum status "LOCKED|ELIGIBLE|CONFIRMED_PAID" }
  Defect { uuid id PK; uuid projectId FK; uuid stepId FK "nullable"; uuid raisedById; text title; enum status "OPEN|FIXED|CLOSED" }
  MaterialProposal { uuid id PK; uuid projectId FK; uuid offerId FK; uuid proposerId; enum status "PROPOSED|APPROVED|REJECTED" }
  Product { uuid id PK; string name; string category; string unit "catalog chung — không gắn giá" }
  Supplier { uuid id PK; string name; bool isMarketplace "true=sàn TMĐT như Shopee, vẫn hiển thị trung lập"; string logoUrl }
  ProductOffer { uuid id PK; uuid productId FK; uuid supplierId FK; decimal price; string affiliateUrl; string note "1 sản phẩm - N nhà cung cấp, sort theo giá, không ưu tiên nguồn nào" }
```

Bất biến quan trọng (enforce trong Workflow Engine, có unit test):

1. Step chỉ `OPEN` khi mọi step trước nó trong phase đã `APPROVED`; phase chỉ mở khi phase trước `DONE`. Toàn bộ phase/step tạo ra ở trạng thái `LOCKED`; hạng mục + bước đầu tiên chỉ được mở khi `approvePlan` chạy (không phải lúc tạo dự án) — đảm bảo thầu không nộp được bằng chứng nào trước khi chủ nhà duyệt kế hoạch.
2. Step `mandatory=true` không thể xóa/sửa `minPhotos` xuống thấp hơn template. Cả hạng mục (Phase) thì được thêm/bớt tự do lúc `PLANNING` (thầu chính hoặc chủ nhà) — quyết định "hạng mục nào áp dụng cho công trình này" là theo từng dự án, không cứng theo template.
3. Submit step yêu cầu `count(photos) >= minPhotos` và (nếu `requiresVideo`) ≥1 video.
4. `OWNER` chỉ duyệt được sau khi `SUPERVISOR` đã duyệt (duyệt 2 lớp).
5. PaymentStage `ELIGIBLE` ⇔ phase mốc `DONE` **và** không còn Defect `OPEN` thuộc các phase trước đó **và** mọi PaymentStage trước đã `CONFIRMED_PAID`.
6. Evidence là immutable — không sửa/xóa sau khi giám sát đã duyệt (audit trail cho tranh chấp).
7. Cổng duyệt vật tư (`MaterialCheck`): khi `Project.contractType != NHAN_CONG` (thầu là bên cung ứng vật tư), `approvePlan` chặn cho tới khi `MaterialCheck.status = APPROVED` — thầu chụp ảnh/bill vật liệu tập kết theo đúng chủng loại chuẩn XA, chủ nhà kiểm tra số lượng rồi mới duyệt. `NHAN_CONG` (chủ đầu tư tự mua vật tư) bỏ qua cổng này. Duyệt theo TỪNG loại vật tư (`MaterialCheckItem`, gộp theo `label`), không duyệt 1 lần cho tất cả: mỗi ảnh upload gắn vào 1 item theo `label` (tạo mới nếu chưa có); `submit()` chuyển `MaterialCheck` sang `SUBMITTED` và reset các item `REJECTED` trước đó về `PENDING`; `decideItem()` chỉ set trạng thái của riêng 1 item (yêu cầu `note` bắt buộc nếu từ chối); `MaterialCheck.status` tổng được suy ra tự động (`recomputeCheckStatus`) mỗi khi 1 item vừa được quyết định và không còn item nào `PENDING`: `APPROVED` nếu mọi item đều `APPROVED`, ngược lại `REJECTED`. Khi bị từ chối, thầu chỉ cần bổ sung/thay ảnh cho đúng item bị từ chối rồi bấm nộp lại — các item đã `APPROVED` giữ nguyên, không phải làm lại từ đầu.
8. Step/Phase tuỳ chỉnh (không từ template) có thể chọn `mandatory=true` ngay lúc thêm vào kế hoạch — một khi đã đánh dấu bắt buộc thì không xoá lại được nữa (giống bước chuẩn), tránh đổi ý tuỳ tiện sau khi cam kết.
9. Media (ảnh/video bằng chứng + ảnh vật tư) lưu vào Google Drive của **chủ nhà** (`Project.driveAccountId`), không lưu ở hạ tầng Homeee — bắt buộc chọn tài khoản Drive lúc tạo dự án mới. Access/refresh token của chủ nhà chỉ tồn tại ở backend (mã hoá AES-256-GCM khi lưu DB), không bao giờ đưa cho thiết bị của thầu/giám sát — vì vậy upload luôn đi qua backend (multipart) thay vì presigned URL thẳng lên storage như trước. File được set quyền "anyone with the link = reader" ngay sau khi tạo để mọi thành viên dự án xem được. Dự án tạo trước tính năng này có `driveAccountId = null` và evidence cũ vẫn còn key R2 — chặn upload mới bằng lỗi rõ ràng cho tới khi chủ nhà gán tài khoản Drive.

---

## 4. API chính (REST, JWT bearer)

```
POST /auth/otp/request        {phone}
POST /auth/otp/verify         {phone, code} → {accessToken, refreshToken}
POST /auth/refresh

GET  /me/google-drive/accounts                 tài khoản Drive đã kết nối của tôi
POST /me/google-drive/start                    trả về {url} để mở trình duyệt xin quyền Google Drive
GET  /google-drive/callback  (công khai, Google gọi)  hoàn tất kết nối, trả trang HTML tự quay lại app
DELETE /me/google-drive/accounts/:id           ngắt kết nối (chặn nếu đang gắn với 1 dự án)

GET  /projects                 danh sách dự án của tôi
POST /projects                 (OWNER) tạo dự án từ template {..., driveAccountId bắt buộc} — copy toàn bộ hạng mục, tất cả LOCKED
POST /projects/:id/members     mời thành viên {phone, role, assignedPhaseCodes?}
GET  /projects/:id/plan-options                (MAIN_CONTRACTOR|OWNER) hạng mục chuẩn chưa thêm vào dự án
POST /projects/:id/phases      {code?, name?}   thêm hạng mục (từ template theo code, hoặc tự tạo theo name)
DELETE /phases/:phaseId                         xoá hạng mục (và toàn bộ bước) — chỉ khi PLANNING
POST /projects/:id/plan/approve(OWNER) duyệt kế hoạch → ACTIVE, mở hạng mục + bước đầu tiên (chặn nếu MaterialCheck chưa APPROVED, xem mục 7 ở trên)
POST /projects/:id/phases/reorder {phaseIds[]}  (MAIN_CONTRACTOR|OWNER) sắp xếp lại thứ tự hạng mục lúc PLANNING

GET  /projects/:id/material-check                          trạng thái cổng duyệt vật tư, gồm items[] + photos (tự tạo lazy nếu thiếu)
POST /projects/:id/material-check/photos     multipart {file, label}  upload ảnh vật tư → Drive; label bắt buộc, là khoá gộp thành 1 MaterialCheckItem
DELETE /material-check-photos/:photoId                      xoá ảnh (trước khi duyệt) — xoá hết ảnh cuối cùng của 1 item thì item cũng bị xoá
POST /projects/:id/material-check/submit {note?}            (thầu) nộp cho chủ nhà kiểm tra, reset các item REJECTED trước đó về PENDING
POST /material-check-items/:itemId/decide {approve,note?}   (OWNER) duyệt/từ chối RIÊNG 1 loại vật tư — note bắt buộc nếu từ chối; MaterialCheck.status tổng tự suy ra khi hết item PENDING

GET  /projects/:id/activity                    nhật ký thi công (mới nhất trước)
POST /projects/:id/activity {message}          thêm ghi chú tay vào nhật ký

POST /me/push-token {pushToken}                lưu Expo push token của thiết bị hiện tại

GET  /projects/:id/phases                     timeline đầy đủ
POST /steps/:id/evidence      multipart {file, type, takenAt?} → tạo Evidence, lưu file vào Drive chủ nhà
POST /steps/:id/submit                        (thầu) nộp bước
POST /steps/:id/approve                       {decision, note} — supervisor rồi owner
POST /steps/:id/comments                      {body, evidenceId?}

GET  /projects/:id/payment-stages             trạng thái gating ứng tiền
POST /payment-stages/:id/confirm-paid         (OWNER) xác nhận đã ứng ngoài app

GET  /projects/:id/defects · POST /defects · PATCH /defects/:id

GET  /content/tips?phaseCode=P07              mẹo theo giai đoạn
GET  /products?category=&search=              so sánh giá đa nhà cung cấp (kể cả Shopee), sort theo giá — không ưu tiên nguồn nào
GET  /products/categories                     danh mục để làm chip lọc
POST /projects/:id/proposals   {offerId}      thầu propose vật liệu theo 1 báo giá (nhà cung cấp) cụ thể
POST /proposals/:id/decide                    chủ nhà chốt
```

---

## 5. Roadmap

| Giai đoạn | Thời gian (solo+AI) | Nội dung |
|---|---|---|
| **M0 — MVP** (code trong repo này) | 4–6 tuần polish | Auth OTP, dự án, quy trình chuẩn seed từ PDF, upload ảnh/duyệt 2 lớp, gating ứng tiền, comment, tips tĩnh. TestFlight + APK nội bộ, chạy thử 2–3 công trình thật |
| M1 — Retention | +4 tuần | Push notification + daily digest, feed mẹo theo giai đoạn, affiliate Shopee links, hồ sơ ngôi nhà |
| M2 — Commerce | +6 tuần | Catalog sản phẩm, propose/chốt vật liệu, so sánh giá Shopee, order trực tiếp (COD/chuyển khoản — vẫn không giữ tiền hộ) |
| M3 — Scale | sau product-market fit | Redis cache, video processing (Cloudflare Stream), web dashboard cho thầu, multi-project cho nhà thầu chuyên nghiệp |

Rủi ro chính cần validate sớm: (1) thầu có chịu chụp ảnh từng bước không → phải làm UX chụp-là-xong dưới 10 giây/ảnh, offline queue; (2) pháp lý affiliate + bán hàng → đăng ký hộ kinh doanh/công ty trước M2.

**Đang chờ (cần credentials/tài khoản bên ngoài mới code tiếp được):**
- **Zalo ZNS**: gửi thông báo qua Zalo cho chủ nhà (ngoài push notification mobile đã có). Cần đăng ký Zalo Official Account + ZNS template, quy trình xét duyệt của Zalo mất vài ngày.
- **AI chatbot trợ lý công trình**: khách hàng hỏi đáp về tiến độ/công trình của họ, có gợi ý (suggestion). Cần chọn nhà cung cấp LLM (khuyến nghị Anthropic Claude API) + API key trước khi code.

**Vừa hoàn thành trong đợt này:**
- Mandatory toggle cho hạng mục/bước tuỳ chỉnh lúc lập kế hoạch.
- `contractType` (5 loại hợp đồng, mở rộng từ 3 loại ban đầu 2026-07-26 — thêm Nhà cải tạo/Nhà chung cư, lọc bớt hạng mục kết cấu thô cho 2 loại này) + cổng duyệt vật tư (`MaterialCheck`) trước khi duyệt kế hoạch — áp dụng khi thầu là bên cung ứng vật tư.
- Nhật ký thi công (`ActivityLog`) — tự ghi theo sự kiện + ghi chú tay.
- Push notification mobile qua Expo (miễn phí) khi có bước cần duyệt/bị từ chối/duyệt xong, lỗi mới, ứng tiền, vật tư, duyệt kế hoạch — **lưu ý: cần tạo EAS project (`eas init`, miễn phí) và điền `extra.eas.projectId` vào `mobile/app.json` thì mới nhận được token thật; thiếu thì app tự bỏ qua đăng ký push, không crash.**
- **Google Drive làm nơi lưu media**: ảnh/video bằng chứng thi công + ảnh vật tư giờ lưu vào Google Drive của chủ nhà (`GoogleDriveAccount`), dưới `Homee/<tên công trình>/<hạng mục thi công>` (ảnh vật tư dùng folder cố định "Vật tư tập kết"). Kiến trúc (đã sửa 1 lần sau khi phát hiện Google từ chối redirect URI `exp://...`/IP LAN — xem chi tiết bên dưới):
  - **Toàn bộ OAuth callback nằm ở backend**, không phải mobile. Lý do: Google chỉ chấp nhận `https://<domain thật>` hoặc `http://localhost` làm redirect URI cho client type **Web application** — từ chối thẳng `exp://`, `homeee://`, hay IP LAN ("must end with a public top-level domain"). Vì `AuthSession.makeRedirectUri()` phía mobile luôn đổi giá trị theo máy/mạng, kiến trúc "mobile tự cầm code" ban đầu không khả thi với Google, phải đổi sang: mobile gọi `POST /me/google-drive/start` (auth) → backend trả `{url}` (đã có `redirect_uri` cố định trỏ về chính backend + `state` là JWT ngắn hạn mã hoá userId) → mobile mở `url` bằng `expo-web-browser` (`openAuthSessionAsync`) → Google redirect thẳng về `GET /google-drive/callback` (route công khai, không qua AuthGuard) → backend verify `state`, đổi `code` lấy access/refresh token, lưu tài khoản, trả 1 trang HTML nhỏ tự chuyển hướng vào lại app qua scheme `homeee://google-drive-connected` (bước này KHÔNG bị Google giới hạn vì là redirect riêng của app, không phải của Google).
  - Refresh token mã hoá AES-256-GCM trước khi lưu DB, không bao giờ rời khỏi backend hay lộ ra API.
  - Vì token thuộc về chủ nhà nhưng người upload có thể là thầu/giám sát (identity khác nhau), **upload luôn đi qua backend** (multipart, không phải presigned URL thẳng lên storage như R2 trước đây): `POST /steps/:id/evidence` và `POST /projects/:id/material-check/photos` giờ nhận `multipart/form-data`.
  - File sau khi upload được set quyền "anyone with the link = reader" để mọi thành viên dự án xem trực tiếp qua link Drive công khai (`drive.google.com/thumbnail?id=...` để hiện ảnh, `drive.google.com/file/d/.../view` để mở gốc/video) mà không cần backend proxy bytes mỗi lần xem — đánh đổi: ảnh không còn riêng tư tuyệt đối (ai có link đều xem được), phù hợp vì đây là ảnh tiến độ công trình, không nhạy cảm. Có thể nâng cấp lên proxy-view sau nếu cần riêng tư chặt hơn.
  - Bắt buộc chọn 1 tài khoản Drive đã kết nối lúc **tạo dự án mới** (`Project.driveAccountId`, nullable ở DB cho dự án cũ trước tính năng này). 1 user có thể kết nối nhiều tài khoản Google (quản lý trong tab Hồ sơ), chọn account nào dùng cho từng công trình.
  - Env cần cấu hình ở backend: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (Google Cloud Console → OAuth client, type **Web application**, bật Drive API + scope `drive.file`), `DRIVE_TOKEN_ENC_KEY` (khoá mã hoá refresh token, sinh riêng mỗi môi trường), và **`GOOGLE_DRIVE_CALLBACK_URL`** — URL https công khai trỏ về `/google-drive/callback` của chính backend. Lúc dev cục bộ (chưa có domain thật): chạy `npx ngrok http 3000`, dán URL ngrok in ra (+ `/google-drive/callback`) vào biến này, rồi đăng ký ĐÚNG URL đó vào Google Console → Authorized redirect URIs. Lưu ý ngrok free đổi URL mỗi lần restart nên cần cập nhật lại cả 2 chỗ (`.env` + Google Console) sau mỗi lần chạy lại ngrok — khi lên staging/prod dùng domain thật cố định thì hết vướng này.

---

## 6. Cấu trúc repo

```
homeee/
├── docs/PLAN.md              ← tài liệu này
├── backend/                  ← NestJS + Prisma (xem backend/README.md)
│   ├── prisma/schema.prisma  ← toàn bộ data model
│   ├── prisma/seed.ts        ← seed 16 hạng mục từ PDF
│   └── src/{auth,users,projects,workflow,payments,content,storage}
└── mobile/                   ← Expo React Native (xem mobile/README.md)
    └── app/                  ← Expo Router
        ├── (tabs)/           ← bottom tab: Công trình · So sánh giá vật tư · Hồ sơ
        └── project, step, payments, members, defects, plan  ← stack screens theo ngữ cảnh 1 dự án
```
