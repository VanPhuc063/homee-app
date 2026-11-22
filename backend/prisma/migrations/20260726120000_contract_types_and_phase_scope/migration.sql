-- AlterEnum: 5 loại hợp đồng thay cho 3 loại cũ (theo product team 2026-07-26).
-- RENAME giữ nguyên dữ liệu các dự án đã tạo (THO_TRON_GOI -> THO_VA_NHAN_CONG_HOAN_THIEN tự động).
ALTER TYPE "ContractType" RENAME VALUE 'THO_TRON_GOI' TO 'THO_VA_NHAN_CONG_HOAN_THIEN';
ALTER TYPE "ContractType" ADD VALUE 'CAI_TAO';
ALTER TYPE "ContractType" ADD VALUE 'CHUNG_CU';

-- CreateEnum
CREATE TYPE "PhaseScope" AS ENUM ('KET_CAU_THO', 'HOAN_THIEN');

-- AlterTable
ALTER TABLE "TemplatePhase" ADD COLUMN "scope" "PhaseScope" NOT NULL DEFAULT 'HOAN_THIEN';

-- AlterTable
ALTER TABLE "Project" ALTER COLUMN "contractType" SET DEFAULT 'THO_VA_NHAN_CONG_HOAN_THIEN';
