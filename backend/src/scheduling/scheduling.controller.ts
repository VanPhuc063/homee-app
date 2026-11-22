import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ReportQuality } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { AuthGuard, AuthUser, CurrentUser } from '../auth/auth.guard';
import { SchedulingService } from './scheduling.service';

const uploadOptions = { storage: memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } };

class PostDailyReportDto {
  @IsOptional() @IsString() body?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) progressPercent?: number;
  @IsOptional() @IsIn(['PASSED', 'FAILED']) qualityDecision?: ReportQuality;
}

class CheckInDto {
  @Type(() => Number) @IsInt() @Min(1) workerCount: number;
  @IsOptional() @IsString() note?: string;
}

@UseGuards(AuthGuard)
@Controller()
export class SchedulingController {
  constructor(private scheduling: SchedulingService) {}

  @Get('projects/:id/schedule')
  getSchedule(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.scheduling.getSchedule(id, user.sub);
  }

  @Get('projects/:id/dashboard')
  getDashboard(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.scheduling.getDashboard(id, user.sub);
  }

  @Get('projects/:id/daily-log')
  getDailyLog(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Query('date') date?: string,
  ) {
    return this.scheduling.getDailyLog(id, user.sub, date);
  }

  @Get('projects/:id/report-feed')
  getReportFeed(@Param('id') id: string, @CurrentUser() user: AuthUser, @Query('before') before?: string) {
    return this.scheduling.getReportFeed(id, user.sub, before);
  }

  @Post('steps/:stepId/daily-log/reports')
  postDailyReport(
    @Param('stepId') stepId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: PostDailyReportDto,
  ) {
    return this.scheduling.postDailyReport(stepId, user.sub, dto);
  }

  @Post('steps/:stepId/daily-log/pick')
  pickDailyLogStep(@Param('stepId') stepId: string, @CurrentUser() user: AuthUser) {
    return this.scheduling.pickStepForDailyLog(stepId, user.sub);
  }

  @Post('steps/:stepId/daily-log/unpick')
  unpickDailyLogStep(@Param('stepId') stepId: string, @CurrentUser() user: AuthUser) {
    return this.scheduling.unpickStepForDailyLog(stepId, user.sub);
  }

  @Post('projects/:id/daily-log/checkin')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  postCheckIn(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CheckInDto,
  ) {
    return this.scheduling.postCheckIn(id, user.sub, file, dto);
  }
}
