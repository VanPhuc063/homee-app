import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { CrewModule } from '../crew/crew.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProjectsModule } from '../projects/projects.module';
import { InvitesController } from './invites.controller';
import { InvitesService } from './invites.service';

@Module({
  imports: [ProjectsModule, NotificationsModule, ActivityModule, CrewModule],
  controllers: [InvitesController],
  providers: [InvitesService],
})
export class InvitesModule {}
