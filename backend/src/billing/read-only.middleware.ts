import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';

/** Dùng thử miễn phí tính từ ngày tạo dự án. */
export const TRIAL_DAYS = 61;
export const PROJECT_READ_ONLY = 'PROJECT_READ_ONLY';
/** Dự án tạo trước khi có tính năng này được tính dùng thử từ ngày triển khai, không bị khoá ngay. */
const TRIAL_GRANDFATHER_FROM = new Date('2026-10-07T00:00:00Z');

/** Mốc bắt đầu dùng thử của 1 dự án. */
export function trialStart(createdAt: Date): Date {
  return createdAt > TRIAL_GRANDFATHER_FROM ? createdAt : TRIAL_GRANDFATHER_FROM;
}

const OWNER_PLANS = ['OWNER_MONTHLY', 'OWNER_6MONTH', 'OWNER_9MONTH', 'OWNER_12MONTH'] as const;
const CONTRACTOR_PLANS = ['CONTRACTOR_MONTHLY', 'CONTRACTOR_10PROJECTS', 'CONTRACTOR_YEARLY'] as const;

/**
 * Dự án còn được ghi dữ liệu không (review 10.6 #14): còn trong 2 tháng dùng thử, hoặc người trả
 * tiền của dự án đang có gói còn hạn. Hết hạn thì CHỈ ĐỌC — vẫn xem, xuất PDF bàn giao được.
 */
export async function projectWritable(prisma: PrismaService, projectId: string): Promise<boolean> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { createdAt: true, billingOwnerId: true },
  });
  if (!project) return true;
  if (Date.now() - trialStart(project.createdAt).getTime() < TRIAL_DAYS * 864e5) return true;
  if (!project.billingOwnerId) return true;
  const now = new Date();
  const count = await prisma.subscription.count({
    where: {
      userId: project.billingOwnerId,
      status: 'ACTIVE',
      plan: { in: [...OWNER_PLANS, ...CONTRACTOR_PLANS] },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });
  return count > 0;
}

// Thao tác ghi vẫn cho phép khi chỉ đọc: thanh toán/đăng nhập không gắn dự án, và xem/đánh dấu đọc.
const PROJECT_PATH = /^\/projects\/([0-9a-f-]{36})(\/|$)/i;
const STEP_PATH = /^\/steps\/([0-9a-f-]{36})(\/|$)/i;

/** Chặn mọi request ghi (POST/PATCH/PUT/DELETE) vào dự án đã hết hạn dùng thử và chưa có gói. */
@Injectable()
export class ReadOnlyMiddleware implements NestMiddleware {
  constructor(private prisma: PrismaService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    if (req.method === 'GET' || req.method === 'OPTIONS') return next();
    const path = req.path;
    let projectId = path.match(PROJECT_PATH)?.[1];
    if (!projectId) {
      const stepId = path.match(STEP_PATH)?.[1];
      if (stepId) {
        const step = await this.prisma.step.findUnique({ where: { id: stepId }, select: { phase: { select: { projectId: true } } } });
        projectId = step?.phase.projectId;
      }
    }
    // Xoá dự án vẫn cho phép (chủ nhà dọn dữ liệu).
    if (!projectId || (req.method === 'DELETE' && PROJECT_PATH.test(path) && path.split('/').length === 3)) return next();
    if (await projectWritable(this.prisma, projectId)) return next();
    next(new ForbiddenException(PROJECT_READ_ONLY));
  }
}
