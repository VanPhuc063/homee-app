import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { IsArray, IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AuthGuard, AuthUser, CurrentUser } from '../auth/auth.guard';
import { TeamService } from './team.service';

const uploadOptions = { storage: memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } };

class AddWorkerDto {
  @IsString() name: string;
}

class AttendanceEntryDto {
  @IsString() teamWorkerId: string;
  @IsBoolean() present: boolean;
  @IsOptional() @IsString() absenceReason?: string;
}

class SubmitAttendanceDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttendanceEntryDto)
  entries: AttendanceEntryDto[];
}

class SubmitReportDto {
  @IsString() workDone: string;
  @IsOptional() @IsString() planTomorrow?: string;
  @IsOptional() @IsString() issues?: string;
}

@UseGuards(AuthGuard)
@Controller()
export class TeamController {
  constructor(private team: TeamService) {}

  @Get('projects/:id/teams')
  overview(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.team.overview(id, user.sub);
  }

  @Get('projects/:id/teams/me')
  myTeam(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.team.myTeam(id, user.sub);
  }

  @Post('projects/:id/teams/workers')
  addWorker(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: AddWorkerDto,
  ) {
    return this.team.addWorker(id, user.sub, dto.name);
  }

  @Delete('team-workers/:workerId')
  removeWorker(@Param('workerId') workerId: string, @CurrentUser() user: AuthUser) {
    return this.team.removeWorker(workerId, user.sub);
  }

  @Post('projects/:id/teams/attendance')
  submitAttendance(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SubmitAttendanceDto,
  ) {
    return this.team.submitAttendance(id, user.sub, dto.entries);
  }

  @Post('projects/:id/teams/reports')
  @UseInterceptors(FilesInterceptor('files', 8, uploadOptions))
  submitReport(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: SubmitReportDto,
  ) {
    return this.team.submitReport(id, user.sub, dto, files);
  }

  @Get('projects/:id/workforce')
  workforce(@Param('id') id: string, @CurrentUser() user: AuthUser, @Query('date') date?: string) {
    return this.team.workforce(id, user.sub, date);
  }

  @Post('projects/:id/workforce/report')
  @UseInterceptors(FilesInterceptor('files', 8, uploadOptions))
  sendWorkforceReport(@Param('id') id: string, @CurrentUser() user: AuthUser, @UploadedFiles() files: Express.Multer.File[]) {
    return this.team.sendWorkforceReport(id, user.sub, files);
  }
}
