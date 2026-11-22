import { ForbiddenException, Injectable } from '@nestjs/common';
import { ActivityKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Nhật ký thi công — feed sự kiện theo thời gian cho mỗi dự án. Các service khác (workflow,
 * payments, projects, material-check) gọi `log()` mỗi khi có hành động đáng ghi lại; người dùng
 * có thể tự thêm ghi chú tay qua `addNote()`.
 */
@Injectable()
export class ActivityService {
  constructor(private prisma: PrismaService) {}

  private async requireMember(projectId: string, userId: string) {
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!member) throw new ForbiddenException('Bạn không thuộc dự án này');
    return member;
  }

  log(
    projectId: string,
    kind: ActivityKind,
    message: string,
    opts?: { actorId?: string; stepId?: string },
  ) {
    return this.prisma.activityLog.create({
      data: {
        projectId,
        kind,
        message,
        actorId: opts?.actorId,
        stepId: opts?.stepId,
      },
    });
  }

  async list(projectId: string, userId: string) {
    await this.requireMember(projectId, userId);
    return this.prisma.activityLog.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { id: true, name: true } } },
    });
  }

  async addNote(projectId: string, userId: string, message: string) {
    await this.requireMember(projectId, userId);
    return this.log(projectId, 'NOTE', message, { actorId: userId });
  }
}
