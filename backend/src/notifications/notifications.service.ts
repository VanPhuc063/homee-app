import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProjectRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';

interface NotifyOpts {
  title: string;
  body: string;
  type?: string;
  data?: Prisma.InputJsonValue;
}

/**
 * Push notification qua Expo Push API — miễn phí, không cần tài khoản/API key ngoài, chỉ cần
 * app đã cấu hình EAS projectId (xem mobile/src/notifications.ts). Nếu user chưa có pushToken
 * (chưa cấp quyền, hoặc app đang chạy trên giả lập) thì tự động bỏ qua người đó.
 *
 * Song song với push, MỌI thông báo đều được ghi vào bảng Notification để có màn Thông báo
 * trong app với trạng thái đã đọc/chưa đọc — khác với push (không có lịch sử, và im lặng nếu
 * user chưa cấp quyền). Vì vậy phần ghi DB không phụ thuộc vào việc có pushToken hay không.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private telegram: TelegramService,
  ) {}

  /** Gửi cho mọi thành viên dự án, trừ người vừa thao tác (nếu có). `roles` để giới hạn theo vai
   * trò khi thông báo gắn với dữ liệu chỉ 1 số role được xem (VD ứng tiền chỉ OWNER/MAIN_CONTRACTOR
   * được xem, xem PaymentsService.list) — tránh báo sai cho người không có quyền xem nội dung đó. */
  async notifyProject(
    projectId: string,
    opts: NotifyOpts & { excludeUserId?: string; roles?: ProjectRole[] },
  ) {
    const members = await this.prisma.projectMember.findMany({
      where: { projectId, ...(opts.roles ? { role: { in: opts.roles } } : {}) },
      include: { user: { select: { id: true, pushToken: true, telegramChatId: true } } },
    });
    const recipients = members.filter((m) => m.userId !== opts.excludeUserId);
    if (recipients.length === 0) return;

    await this.prisma.notification.createMany({
      data: recipients.map((m) => ({
        userId: m.userId,
        title: opts.title,
        body: opts.body,
        type: opts.type ?? 'GENERIC',
        data: opts.data,
      })),
    });

    const tokens = recipients
      .filter((m) => !!m.user.pushToken)
      .map((m) => m.user.pushToken as string);
    if (tokens.length > 0) await this.send(tokens, opts.title, opts.body);

    await this.sendTelegram(
      recipients.map((m) => m.user.telegramChatId).filter((id): id is string => !!id),
      opts.title,
      opts.body,
    );
  }

  /** Gửi cho đúng 1 user — dùng cho lời mời từ tab Khám phá, vì người được mời chưa phải thành
   * viên dự án nên không nằm trong `notifyProject`. */
  async notifyUser(userId: string, opts: NotifyOpts) {
    await this.prisma.notification.create({
      data: {
        userId,
        title: opts.title,
        body: opts.body,
        type: opts.type ?? 'GENERIC',
        data: opts.data,
      },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { pushToken: true, telegramChatId: true },
    });
    if (user?.pushToken) await this.send([user.pushToken], opts.title, opts.body);
    if (user?.telegramChatId) await this.sendTelegram([user.telegramChatId], opts.title, opts.body);
  }

  /**
   * Báo riêng cho thành viên được tag "@Tên" trong `text` (app chèn đúng tên thành viên khi bấm
   * chip tag). Trả về id người được tag để caller loại khỏi thông báo chung, tránh báo 2 lần.
   */
  async notifyMentions(projectId: string, authorId: string, text: string, opts: NotifyOpts) {
    const members = await this.prisma.projectMember.findMany({
      where: { projectId, userId: { not: authorId } },
      select: { userId: true, user: { select: { name: true } } },
    });
    const tagged = members.filter((m) => m.user.name && text.includes(`@${m.user.name}`)).map((m) => m.userId);
    for (const userId of tagged) await this.notifyUser(userId, opts);
    return tagged;
  }

  /** Danh sách thông báo trong app, mới nhất trước — giới hạn 100 bản ghi gần nhất cho MVP. */
  list(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, read: false } });
  }

  async markRead(id: string, userId: string) {
    const n = await this.prisma.notification.findUnique({ where: { id } });
    if (!n) throw new NotFoundException();
    if (n.userId !== userId) throw new ForbiddenException();
    if (n.read) return n;
    return this.prisma.notification.update({ where: { id }, data: { read: true } });
  }

  markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }

  private async sendTelegram(chatIds: string[], title: string, body: string) {
    if (chatIds.length === 0) return;
    const text = `*${title}*\n${body}`;
    await Promise.all(chatIds.map((id) => this.telegram.sendMessage(id, text)));
  }

  private async send(tokens: string[], title: string, body: string) {
    try {
      const messages = tokens.map((to) => ({ to, title, body, sound: 'default' }));
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
      });
      if (!res.ok) {
        this.logger.warn(`Expo push API trả lỗi HTTP ${res.status}`);
      }
    } catch (e) {
      // Không throw — gửi push thất bại không được phép làm hỏng thao tác chính (duyệt bước, v.v.)
      this.logger.warn(`Gửi push thất bại: ${(e as Error).message}`);
    }
  }
}
