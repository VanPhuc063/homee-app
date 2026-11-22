import { Module } from '@nestjs/common';
import { PlanChangeModule } from '../plan-change/plan-change.module';
import { ProjectsModule } from '../projects/projects.module';
import { ImportScheduleController } from './import-schedule.controller';
import { ImportScheduleService } from './import-schedule.service';

@Module({
  imports: [ProjectsModule, PlanChangeModule],
  controllers: [ImportScheduleController],
  providers: [ImportScheduleService],
})
export class ImportScheduleModule {}
