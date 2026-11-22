import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { AuthGuard, AuthUser, CurrentUser } from '../auth/auth.guard';
import { MaterialLogService } from './material-log.service';

// Hóa đơn/chứng từ chỉ là ảnh chụp — 10MB/ảnh theo spec, khác hẳn giới hạn 100MB dùng cho
// evidence/video ở các module khác.
const uploadOptions = { storage: memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } };

function parseJsonArray({ value }: { value: unknown }) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }
  return value;
}

class AddMaterialDto {
  @IsString() name: string;
  @Type(() => Number) @IsNumber() @Min(0.01) quantity: number;
  @IsString() unit: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) unitPrice?: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsOptional() @IsString() date?: string;
  @Transform(parseJsonArray) @IsArray() @IsString({ each: true }) stepIds: string[];
}

class UpdateMaterialDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.01) quantity?: number;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) unitPrice?: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

class AddDayNoteDto {
  @IsString() body: string;
  @IsOptional() @IsString() date?: string;
}

@UseGuards(AuthGuard)
@Controller()
export class MaterialLogController {
  constructor(private materialLog: MaterialLogService) {}

  @Get('projects/:id/material-logs')
  getDailyLog(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Query('date') date?: string,
  ) {
    return this.materialLog.getDailyLog(id, user.sub, date);
  }

  @Post('projects/:id/material-logs')
  @UseInterceptors(FilesInterceptor('files', 5, uploadOptions))
  addMaterial(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: AddMaterialDto,
  ) {
    return this.materialLog.addMaterial(id, user.sub, dto, files);
  }

  @Patch('material-logs/:materialId')
  updateMaterial(
    @Param('materialId') materialId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateMaterialDto,
  ) {
    return this.materialLog.updateMaterial(materialId, user.sub, dto);
  }

  @Delete('material-logs/:materialId')
  deleteMaterial(@Param('materialId') materialId: string, @CurrentUser() user: AuthUser) {
    return this.materialLog.deleteMaterial(materialId, user.sub);
  }

  @Post('projects/:id/material-logs/notes')
  addDayNote(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: AddDayNoteDto,
  ) {
    return this.materialLog.addDayNote(id, user.sub, dto);
  }
}
