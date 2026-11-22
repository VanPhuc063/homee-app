# Homeee Backend — NestJS + Prisma + PostgreSQL

## Chạy local

```bash
cd backend
npm install

# 1. Tạo Postgres (Docker hoặc Supabase free tier)
docker run -d --name homeee-db -e POSTGRES_PASSWORD=password -e POSTGRES_DB=homeee -p 5432:5432 postgres:16

# 2. Cấu hình
cp .env.example .env   # sửa DATABASE_URL nếu cần

# 3. Migrate (áp toàn bộ migration có sẵn, gồm cả Supplier/ProductOffer so sánh giá) + seed
npx prisma migrate deploy
npx prisma generate
npm run seed
# Từ lần sau, khi tự sửa schema.prisma: dùng `npx prisma migrate dev --name <tên>` để Prisma tự tạo migration mới.

# 4. Chạy
npm run start:dev      # http://localhost:3000
```

## Thử nhanh flow chính (OTP_DEV_MODE=true → OTP luôn là 000000)

```bash
# Chủ nhà đăng nhập
curl -X POST localhost:3000/auth/otp/request -H 'Content-Type: application/json' -d '{"phone":"0901234567","name":"Chu Nha"}'
curl -X POST localhost:3000/auth/otp/verify  -H 'Content-Type: application/json' -d '{"phone":"0901234567","code":"000000"}'
# → lấy accessToken, export TOKEN=...

# Tạo dự án từ template chuẩn (hạng mục tự sinh theo loại hợp đồng, mặc định THO_VA_NHAN_CONG_HOAN_THIEN)
curl -X POST localhost:3000/projects -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"name":"Nhà phố Q7"}'

# Mời thầu chính / giám sát / thầu phụ
curl -X POST localhost:3000/projects/<id>/members -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"phone":"0907777777","name":"Thau Chinh","role":"MAIN_CONTRACTOR"}'

# Duyệt kế hoạch → ACTIVE, xem timeline
curl -X POST localhost:3000/projects/<id>/plan/approve -H "Authorization: Bearer $TOKEN"
curl localhost:3000/projects/<id>/phases -H "Authorization: Bearer $TOKEN"
```

Flow bước: thầu `presign` → upload R2 → `evidence/confirm` → `submit` → giám sát `approve` → chủ nhà `approve` → bước sau tự mở khóa → hết phase + hết defect → đợt ứng tiền `ELIGIBLE`.

## Deploy

**VPS (CI/CD tự động — khuyến nghị):** push lên `main` → GitHub Actions build Docker image, push lên GHCR (`ghcr.io/cris-the-dev/homee-backend`), rồi SSH vào VPS pull + restart container. Xem `.github/workflows/deploy.yml`, `backend/Dockerfile`, `deploy/docker-compose.yml`.

Setup 1 lần trên VPS: cài Docker, tạo user `deploy` riêng (nhóm `docker`), copy `deploy/docker-compose.yml` vào `/opt/homee-backend/docker-compose.yml`, tạo `.env` cạnh đó (theo `.env.example`, không commit), `docker login ghcr.io` (package private). Repo cần secrets `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY` (khoá deploy riêng, không dùng key cá nhân), `SSH_PORT` (nếu khác 22).

Railway/Fly.io (region Singapore) vẫn dùng được nếu muốn: connect repo, set env vars theo `.env.example`, build command `npm run build && npx prisma migrate deploy`, start `npm run start:prod`.
