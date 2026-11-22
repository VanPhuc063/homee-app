import { Body, Controller, Delete, Post, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthUser, CurrentUser } from '../auth/auth.guard';
import { TelegramService } from './telegram.service';

@Controller()
export class TelegramController {
  constructor(private telegram: TelegramService) {}

  @UseGuards(AuthGuard)
  @Post('me/telegram-link')
  requestLink(@CurrentUser() user: AuthUser) {
    return this.telegram.requestLink(user.sub);
  }

  @UseGuards(AuthGuard)
  @Delete('me/telegram-link')
  unlink(@CurrentUser() user: AuthUser) {
    return this.telegram.unlink(user.sub);
  }

  /** Endpoint công khai — Telegram gọi thẳng, không có Authorization header nào để AuthGuard kiểm
   * tra. Đăng ký URL này làm webhook qua `setWebhook` (xem README triển khai). */
  @Post('telegram/webhook')
  webhook(@Body() update: { message?: { chat?: { id?: number }; text?: string } }) {
    return this.telegram.handleWebhookUpdate(update);
  }
}
