-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "billingOwnerId" TEXT;


-- Dự án cũ: bên trả = người tạo, suy ra từ thành viên vào dự án sớm nhất.
UPDATE "Project" p SET "billingOwnerId" = (
  SELECT m."userId" FROM "ProjectMember" m WHERE m."projectId" = p."id" ORDER BY m."createdAt" ASC LIMIT 1
) WHERE p."billingOwnerId" IS NULL;
