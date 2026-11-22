import { Module } from '@nestjs/common';
import { GoogleDriveModule } from '../google-drive/google-drive.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [SchedulingModule, NotificationsModule, GoogleDriveModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
