import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Mã lỗi mobile nhận diện để hiện màn mở khoá AI (mockup 28) thay vì báo lỗi thường. */
export const AI_PREMIUM_REQUIRED = 'AI_PREMIUM_REQUIRED';

/**
 * AI Premium (mockup 28, 34–35) theo nguyên tắc 1 dự án = 1 bên trả: dự án dùng AI khi người trả
 * tiền của dự án (người tạo) đã mua — mọi thành viên dự án đó cùng hưởng. Dự án cũ chưa có
 * billingOwnerId thì xét chủ nhà/thầu chính như trước.
 */
export async function projectHasAiPremium(prisma: PrismaService, projectId: string): Promise<boolean> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { billingOwnerId: true } });
  const buyerIds = project?.billingOwnerId
    ? [project.billingOwnerId]
    : (
        await prisma.projectMember.findMany({
          where: { projectId, role: { in: ['OWNER', 'MAIN_CONTRACTOR'] } },
          select: { userId: true },
        })
      ).map((m) => m.userId);
  if (!buyerIds.length) return false;
  const count = await prisma.subscription.count({
    where: { userId: { in: buyerIds }, plan: 'AI_PREMIUM', status: 'ACTIVE' },
  });
  return count > 0;
}

export async function requireAiPremium(prisma: PrismaService, projectId: string) {
  if (!(await projectHasAiPremium(prisma, projectId))) {
    throw new ForbiddenException(AI_PREMIUM_REQUIRED);
  }
}

/** Hạn mức lượt AI mỗi dự án mỗi tháng — mỗi lượt gọi Claude đều tốn phí (review 10.6). */
export const AI_MONTHLY_LIMIT = 300;

/** Kiểm tra còn lượt rồi ghi nhận 1 lượt. Hết lượt thì báo lỗi rõ, sang tháng sau tự reset. */
export async function consumeAiQuota(prisma: PrismaService, projectId: string, userId: string, kind: string) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const used = await prisma.aiUsage.count({ where: { projectId, createdAt: { gte: monthStart } } });
  if (used >= AI_MONTHLY_LIMIT) {
    throw new ForbiddenException(`Dự án đã dùng hết ${AI_MONTHLY_LIMIT} lượt AI tháng này, sang tháng sau sẽ có lượt mới`);
  }
  await prisma.aiUsage.create({ data: { projectId, userId, kind } });
}
