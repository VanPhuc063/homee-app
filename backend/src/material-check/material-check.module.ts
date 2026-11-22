import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProjectsModule } from '../projects/projects.module';
import { GoogleDriveModule } from '../google-drive/google-drive.module';
import { MaterialCheckController } from './material-check.controller';
import { MaterialCheckService } from './material-check.service';

@Module({
  imports: [ProjectsModule, GoogleDriveModule, ActivityModule, NotificationsModule],
  controllers: [MaterialCheckController],
  providers: [MaterialCheckService],
})
export class MaterialCheckModule {}
