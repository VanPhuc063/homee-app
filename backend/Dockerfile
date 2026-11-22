# Multi-stage build: compile on the builder stage, ship only the production
# output + prod deps in the runtime stage (keeps the final image small and
# free of devDependencies/build tools).

FROM node:20-slim AS build
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
# ts-node (chạy "npm run seed" thủ công trong container) đọc tsconfig.json để biết resolveJsonModule
# và các compilerOptions khác — thiếu file này thì ts-node rơi về default cứng nhắc của TS, lỗi
# "Cannot find module './seed-data/standard-process.json'" dù code không sai gì.
COPY --from=build /app/tsconfig.json ./tsconfig.json

EXPOSE 3000
# Áp migration trước khi start — tương đương bước "release" của Railway/Fly.io
# (xem backend/README.md), nhưng chạy mỗi lần container khởi động thay vì ở build step.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
