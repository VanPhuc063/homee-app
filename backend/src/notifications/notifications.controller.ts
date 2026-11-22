import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthUser, CurrentUser } from '../auth/auth.guard';
import { NotificationsService } from './notifications.service';

@UseGuards(AuthGuard)
@Controller('me/notifications')
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.notifications.list(user.sub);
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AuthUser) {
    const count = await this.notifications.unreadCount(user.sub);
    return { count };
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.sub);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.notifications.markRead(id, user.sub);
  }
}
