import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Kênh thông báo Telegram Bot song song với push (Requirements v2.1 §9) — hoàn toàn optional, chỉ
 * hoạt động khi VPS cấu hình TELEGRAM_BOT_TOKEN (+ TELEGRAM_BOT_USERNAME để tạo deep-link). Thiếu
 * cấu hình thì các hàm tự bỏ qua, không throw — khớp cách NotificationsService xử lý push thất bại
 * (không được phép làm hỏng thao tác chính).
 *
 * Liên kết tài khoản: user bấm "Kết nối Telegram" ở Hồ sơ → BE tạo `telegramLinkCode` ngẫu nhiên →
 * mobile mở `https://t.me/<bot>?start=<code>` → Telegram gửi update `/start <code>` tới webhook →
 * `handleWebhookUpdate` khớp code với user, lưu `chatId`, xoá code (dùng 1 lần).
 */
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(private prisma: PrismaService) {}

  private get botToken(): string | undefined {
    return process.env.TELEGRAM_BOT_TOKEN;
  }

  private get botUsername(): string | undefined {
    return process.env.TELEGRAM_BOT_USERNAME;
  }

  get configured(): boolean {
    return !!this.botToken && !!this.botUsername;
  }

  async requestLink(userId: string): Promise<{ deepLink: string } | { error: string }> {
    if (!this.configured) {
      return { error: 'Chưa cấu hình Telegram Bot trên server' };
    }
    const code = randomBytes(6).toString('hex');
    await this.prisma.user.update({ where: { id: userId }, data: { telegramLinkCode: code } });
    return { deepLink: `https://t.me/${this.botUsername}?start=${code}` };
  }

  async unlink(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { telegramChatId: null, telegramLinkCode: null },
    });
    return { ok: true };
  }

  /** Webhook nhận mọi update từ Telegram — chỉ xử lý lệnh /start <code> để liên kết tài khoản, các
   * update khác bỏ qua (bot không có tính năng chat 2 chiều nào khác ở MVP này). */
  async handleWebhookUpdate(update: {
    message?: { chat?: { id?: number }; text?: string };
  }): Promise<void> {
    const text = update.message?.text;
    const chatId = update.message?.chat?.id;
    if (!text || chatId == null) return;
    const match = text.match(/^\/start\s+(\S+)/);
    if (!match) return;
    const code = match[1];

    const user = await this.prisma.user.findFirst({ where: { telegramLinkCode: code } });
    if (!user) {
      await this.sendMessage(String(chatId), 'Mã liên kết không hợp lệ hoặc đã hết hạn. Hãy bấm lại "Kết nối Telegram" trong app Homee.');
      return;
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { telegramChatId: String(chatId), telegramLinkCode: null },
    });
    await this.sendMessage(String(chatId), `Đã liên kết Telegram với tài khoản Homee của ${user.name}. Từ giờ bạn sẽ nhận thông báo dự án tại đây.`);
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    if (!this.botToken) return;
    try {
      const res = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
      if (!res.ok) this.logger.warn(`Telegram sendMessage trả lỗi HTTP ${res.status}`);
    } catch (e) {
      this.logger.warn(`Gửi Telegram thất bại: ${(e as Error).message}`);
    }
  }
}
