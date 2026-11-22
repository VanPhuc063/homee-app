import {
  Body,
  Controller,
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
import { DefectStatus, EvidenceType } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { AuthGuard, AuthUser, CurrentUser } from '../auth/auth.guard';
import { WorkflowService } from './workflow.service';

const uploadOptions = { storage: memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } };

class UploadEvidenceDto {
  @IsEnum(EvidenceType) type: EvidenceType;
  @IsOptional() @IsString() takenAt?: string;
}

class ApproveDto {
  @IsIn(['APPROVED', 'REJECTED']) decision: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() note?: string;
}

class CommentDto {
  @IsString() body: string;
  @IsOptional() @IsString() evidenceId?: string;
}

class CreateDefectDto {
  @IsString() title: string;
  @IsOptional() @IsString() stepId?: string;
}

class UpdateDefectDto {
  @IsEnum(DefectStatus) status: DefectStatus;
}

@UseGuards(AuthGuard)
@Controller()
export class WorkflowController {
  constructor(private workflow: WorkflowService) {}

  @Get('steps/:id')
  detail(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.workflow.getStepDetail(id, user.sub);
  }

  @Post('steps/:id/evidence')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  uploadEvidence(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadEvidenceDto,
  ) {
    return this.workflow.uploadEvidence(id, user.sub, file, dto);
  }

  @Post('steps/:id/submit')
  submit(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.workflow.submitStep(id, user.sub);
  }

  @Post('steps/:id/approve')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  approve(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: ApproveDto,
  ) {
    return this.workflow.approveStep(id, user.sub, file, dto);
  }

  @Post('steps/:id/comments')
  comment(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: CommentDto) {
    return this.workflow.addComment(id, user.sub, dto);
  }

  @Get('projects/:id/defects')
  defects(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.workflow.listDefects(id, user.sub);
  }

  @Post('projects/:id/defects')
  createDefect(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateDefectDto,
  ) {
    return this.workflow.createDefect(id, user.sub, dto);
  }

  @Patch('defects/:id')
  updateDefect(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateDefectDto,
  ) {
    return this.workflow.updateDefect(id, user.sub, dto.status);
  }
}
