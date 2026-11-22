import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { AdminController, AdminGuard } from './admin.controller';
import { AdminPageController } from './admin-page.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [NotificationsModule, StorageModule],
  controllers: [AdminController, AdminPageController],
  providers: [AdminService, AdminGuard],
})
export class AdminModule {}
