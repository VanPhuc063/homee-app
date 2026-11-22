import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { WorkflowModule } from './workflow/workflow.module';
import { PaymentsModule } from './payments/payments.module';
import { ContentModule } from './content/content.module';
import { StorageModule } from './storage/storage.module';
import { PrismaModule } from './prisma/prisma.module';
import { ActivityModule } from './activity/activity.module';
import { ChatModule } from './chat/chat.module';
import { MaterialCheckModule } from './material-check/material-check.module';
import { MaterialLogModule } from './material-log/material-log.module';
import { NotificationsModule } from './notifications/notifications.module';
import { GoogleDriveModule } from './google-drive/google-drive.module';
import { DirectoryModule } from './directory/directory.module';
import { InvitesModule } from './invites/invites.module';
import { ReviewsModule } from './reviews/reviews.module';
import { PlanChangeModule } from './plan-change/plan-change.module';
import { RemindersModule } from './reminders/reminders.module';
import { CrewModule } from './crew/crew.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { WeatherModule } from './weather/weather.module';
import { ImportScheduleModule } from './import-schedule/import-schedule.module';
import { TeamModule } from './team/team.module';
import { TelegramModule } from './telegram/telegram.module';
import { AiModule } from './ai/ai.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { AffiliateModule } from './affiliate/affiliate.module';
import { ReadOnlyMiddleware } from './billing/read-only.middleware';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    ProjectsModule,
    WorkflowModule,
    PaymentsModule,
    ContentModule,
    StorageModule,
    ActivityModule,
    MaterialCheckModule,
    ChatModule,
    MaterialLogModule,
    NotificationsModule,
    GoogleDriveModule,
    DirectoryModule,
    InvitesModule,
    ReviewsModule,
    PlanChangeModule,
    RemindersModule,
    CrewModule,
    SchedulingModule,
    WeatherModule,
    ImportScheduleModule,
    TeamModule,
    TelegramModule,
    AiModule,
    SubscriptionModule,
    AffiliateModule,
    AdminModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ReadOnlyMiddleware).forRoutes('*');
  }
}
