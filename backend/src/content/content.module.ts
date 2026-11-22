import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProjectsModule } from '../projects/projects.module';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';

@Module({
  imports: [ProjectsModule, NotificationsModule],
  controllers: [ContentController],
  providers: [ContentService],
})
export class ContentModule {}
