import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
import { AuthGuard, AuthUser, CurrentUser } from '../auth/auth.guard';
import { StorageService } from './storage.service';

class PresignDto {
  @IsString() contentType: string;
}

@UseGuards(AuthGuard)
@Controller()
export class StorageController {
  constructor(private storage: StorageService) {}

  @Post('steps/:id/evidence/presign')
  presign(
    @Param('id') stepId: string,
    @CurrentUser() _user: AuthUser,
    @Body() dto: PresignDto,
  ) {
    return this.storage.presignUpload(stepId, dto.contentType);
  }
}
