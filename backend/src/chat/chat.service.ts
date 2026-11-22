import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

/** Khoảng im lặng giữa 2 lần báo push cho cùng 1 người gửi — nhắn liền nhiều tin chỉ báo 1 lần. */
const NOTIFY_COOLDOWN_MS = 2 * 60 * 1000;
const PAGE_SIZE = 50;

/**
 * Chat chung của dự án — cửa sổ chat nổi ở góc màn dự án, tag "@Tên" để báo riêng người đó. App
 * tự hỏi lại mỗi vài giây (polling) thay vì websocket để giữ hạ tầng đơn giản; `after` = chỉ tin mới.
 */
@Injectable()
export class ChatService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  private async requireMember(projectId: string, userId: string) {
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!member) throw new ForbiddenException('Bạn không thuộc dự án này');
    return member;
  }

  /** Mặc định trả 50 tin gần nhất (cũ → mới). `before` = tải thêm tin cũ, `after` = chỉ tin mới. */
  async list(projectId: string, userId: string, opts: { before?: string; after?: string }) {
    await this.requireMember(projectId, userId);
    const createdAt = opts.after
      ? { gt: new Date(opts.after) }
      : opts.before
        ? { lt: new Date(opts.before) }
        : undefined;
    const rows = await this.prisma.projectMessage.findMany({
      where: { projectId, ...(createdAt ? { createdAt } : {}) },
      orderBy: { createdAt: opts.after ? 'asc' : 'desc' },
      take: PAGE_SIZE,
      include: { author: { select: { id: true, name: true } } },
    });
    const members = await this.prisma.projectMember.findMany({
      where: { projectId },
      select: { userId: true, role: true },
    });
    const roleOf = new Map(members.map((m) => [m.userId, m.role]));
    const ordered = opts.after ? rows : rows.reverse();
    return ordered.map((m) => ({ ...m, authorRole: roleOf.get(m.authorId) ?? null }));
  }

  async send(projectId: string, userId: string, body: string) {
    const member = await this.requireMember(projectId, userId);
    const text = body.trim();
    if (!text) throw new BadRequestException('Tin nhắn trống');

    const recent = await this.prisma.projectMessage.findFirst({
      where: { projectId, authorId: userId, createdAt: { gt: new Date(Date.now() - NOTIFY_COOLDOWN_MS) } },
      select: { id: true },
    });
    const message = await this.prisma.projectMessage.create({
      data: { projectId, authorId: userId, body: text.slice(0, 2000) },
      include: { author: { select: { id: true, name: true } } },
    });

    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { name: true } });
    const preview = text.length > 120 ? `${text.slice(0, 117)}…` : text;
    // Người được tag luôn nhận push riêng (không bị cooldown); những người còn lại chỉ nhận 1 push
    // cho mỗi đợt nhắn liền nhau.
    await this.notifications.notifyMentions(projectId, userId, text, {
      title: `💬 ${message.author.name} đã tag bạn — ${project?.name ?? 'Dự án'}`,
      body: preview,
      type: 'PROJECT_CHAT',
      data: { projectId },
    });
    if (!recent) {
      await this.notifications.notifyProject(projectId, {
        title: `💬 ${message.author.name} — ${project?.name ?? 'Dự án'}`,
        body: preview,
        type: 'PROJECT_CHAT',
        data: { projectId },
        excludeUserId: userId,
      });
    }
    return { ...message, authorRole: member.role };
  }
}
