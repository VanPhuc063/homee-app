import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { AffiliateModule } from '../affiliate/affiliate.module';
import { CrewModule } from '../crew/crew.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [ActivityModule, NotificationsModule, CrewModule, SchedulingModule, AffiliateModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
