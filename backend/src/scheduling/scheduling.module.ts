import { Module } from '@nestjs/common';
import { WeatherModule } from '../weather/weather.module';
import { GoogleDriveModule } from '../google-drive/google-drive.module';
import { SchedulingController } from './scheduling.controller';
import { DailyLogExportController } from './daily-log-export.controller';
import { SchedulingService } from './scheduling.service';

@Module({
  imports: [WeatherModule, GoogleDriveModule],
  controllers: [SchedulingController, DailyLogExportController],
  providers: [SchedulingService],
  exports: [SchedulingService],
})
export class SchedulingModule {}
