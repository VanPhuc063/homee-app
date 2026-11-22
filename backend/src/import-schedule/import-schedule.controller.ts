import { Body, Controller, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { IsOptional, IsString } from 'class-validator';
import { AuthGuard, AuthUser, CurrentUser } from '../auth/auth.guard';
import { ImportScheduleService } from './import-schedule.service';

const uploadOptions = { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } };

class ImportScheduleDto {
  @IsOptional() @IsString() note?: string;
}

@UseGuards(AuthGuard)
@Controller()
export class ImportScheduleController {
  constructor(private importSchedule: ImportScheduleService) {}

  @Post('projects/:id/plan-import')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  requestImport(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: ImportScheduleDto,
  ) {
    return this.importSchedule.requestImport(id, user.sub, file, dto.note);
  }
}
