import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MaterialCategory } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { AuthGuard, AuthUser, CurrentUser } from '../auth/auth.guard';
import { MaterialCheckService } from './material-check.service';

const uploadOptions = { storage: memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } };
const CATEGORIES = ['THO', 'SON', 'CUA', 'NOI_THAT'];

class ItemDetailsDto {
  @IsOptional() @IsIn(CATEGORIES) category?: MaterialCategory;
  @IsOptional() @IsString() quantityLabel?: string;
  @IsOptional() @IsNumber() @Min(0) unitPrice?: number;
  @IsOptional() @IsNumber() @Min(0) contractValue?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) stepIds?: string[];
}

class AddPhotoDto extends ItemDetailsDto {
  // Bắt buộc — label chính là khoá gộp nhóm ảnh (xem MaterialCheckService.addPhoto).
  @IsString() @IsNotEmpty() label: string;
  @IsOptional() @IsString() supplierName?: string;
}

class SubmitDto {
  @IsOptional() @IsString() note?: string;
}

class DecideBatchDto {
  @IsBoolean() approve: boolean;
  @IsOptional() @IsString() note?: string;
}

class CommentDto {
  @IsString() @IsNotEmpty() body: string;
}

@UseGuards(AuthGuard)
@Controller()
export class MaterialCheckController {
  constructor(private materialCheck: MaterialCheckService) {}

  @Get('projects/:id/material-check')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.materialCheck.getOrCreate(id, user.sub);
  }

  @Post('projects/:id/material-check/photos')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  addPhoto(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: AddPhotoDto,
  ) {
    return this.materialCheck.addPhoto(id, user.sub, file, dto);
  }

  @Patch('material-check-items/:itemId')
  updateItemDetails(
    @Param('itemId') itemId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ItemDetailsDto,
  ) {
    return this.materialCheck.updateItemDetails(itemId, user.sub, dto);
  }

  @Delete('material-check-photos/:photoId')
  removePhoto(@Param('photoId') photoId: string, @CurrentUser() user: AuthUser) {
    return this.materialCheck.removePhoto(photoId, user.sub);
  }

  @Post('projects/:id/material-check/submit')
  submit(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: SubmitDto) {
    return this.materialCheck.submit(id, user.sub, dto.note);
  }

  @Post('material-batches/:batchId/decide')
  decideBatch(
    @Param('batchId') batchId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: DecideBatchDto,
  ) {
    return this.materialCheck.decideBatch(batchId, user.sub, dto.approve, dto.note);
  }

  @Post('material-batches/:batchId/comments')
  postComment(
    @Param('batchId') batchId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CommentDto,
  ) {
    return this.materialCheck.postBatchComment(batchId, user.sub, dto.body);
  }
}
