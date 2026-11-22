import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProjectsModule } from '../projects/projects.module';
import { PlanChangeController } from './plan-change.controller';
import { PlanChangeService } from './plan-change.service';

@Module({
  imports: [ProjectsModule, ActivityModule, NotificationsModule],
  controllers: [PlanChangeController],
  providers: [PlanChangeService],
  exports: [PlanChangeService],
})
export class PlanChangeModule {}
