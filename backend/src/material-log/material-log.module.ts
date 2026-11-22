import { Module } from '@nestjs/common';
import { GoogleDriveModule } from '../google-drive/google-drive.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MaterialLogController } from './material-log.controller';
import { MaterialLogService } from './material-log.service';

@Module({
  imports: [GoogleDriveModule, NotificationsModule],
  controllers: [MaterialLogController],
  providers: [MaterialLogService],
})
export class MaterialLogModule {}
