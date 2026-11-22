import { Module } from '@nestjs/common';
import { GoogleDriveModule } from '../google-drive/google-drive.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';

@Module({
  imports: [GoogleDriveModule, NotificationsModule],
  controllers: [TeamController],
  providers: [TeamService],
})
export class TeamModule {}
