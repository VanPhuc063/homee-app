import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ContractType, ProjectRole, TeamType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { AuthGuard, AuthUser, CurrentUser } from '../auth/auth.guard';
import { ProjectsService } from './projects.service';

class CustomPhaseStepDto {
  @IsString() name: string;
}

class CustomPhaseDto {
  @IsString() name: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomPhaseStepDto)
  steps: CustomPhaseStepDto[];
}

class ExtraStepDto {
  @IsString() phaseCode: string;
  @IsString() name: string;
}

class CreateProjectDto {
  @IsString() name: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() floors?: string;
  @IsOptional() @IsString() buildingType?: string;
  @IsOptional() @IsDateString() expectedStartDate?: string;
  @IsOptional() @IsDateString() expectedEndDate?: string;
  @IsOptional() @IsString() templateId?: string;
  @IsOptional() @IsEnum(ContractType) contractType?: ContractType;
  /// Tài khoản Google Drive của chủ nhà dùng lưu ảnh/video công trình — bắt buộc chọn lúc tạo.
  @IsString() driveAccountId: string;
  /// Vai trò của người tạo cho chính dự án này — OWNER (chủ nhà, mặc định) hoặc MAIN_CONTRACTOR
  /// (thầu chính tự tạo dự án, mời chủ nhà vào sau). Không phải "loại tài khoản" cố định, chỉ áp
  /// dụng riêng cho dự án đang tạo — xem ProjectsService.create.
  @IsOptional() @IsIn(['OWNER', 'MAIN_CONTRACTOR']) creatorRole?: ProjectRole;
  /** Mã hạng mục bị bỏ chọn ở bước "Chọn bước thi công áp dụng" — xem ProjectsService.create. */
  @IsOptional() @IsArray() excludePhaseCodes?: string[];
  /** Hạng mục Add-on tự thêm ngay lúc tạo dự án — xem ProjectsService.create. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomPhaseDto)
  customPhases?: CustomPhaseDto[];
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExtraStepDto)
  extraSteps?: ExtraStepDto[];
}

class AddMemberDto {
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() name?: string;
  @IsEnum(ProjectRole) role: ProjectRole;
  @IsOptional() @IsArray() assignedPhaseCodes?: string[];
  /** Chỉ có ý nghĩa với role SUPERVISOR — mời giám sát theo từng bước cụ thể thay vì cả dự án. */
  @IsOptional() @IsArray() assignedStepIds?: string[];
  /** Chỉ có ý nghĩa với role SUB_CONTRACTOR — mời thầu phụ đứng vai "đội trưởng" quản lý 1 đội
   * (điểm danh + báo cáo hàng ngày), xem TeamService. */
  @IsOptional() @IsEnum(TeamType) teamType?: TeamType;
}

class AddStepDto {
  @IsString() name: string;
  @IsOptional() @IsString() acceptance?: string;
  @IsOptional() @IsInt() @Min(0) minPhotos?: number;
  @IsOptional() @IsBoolean() requiresVideo?: boolean;
  @IsOptional() @IsBoolean() mandatory?: boolean;
  /** Nhãn tầng (VD "Lầu 2") — dùng khi nhân bản 1 bước lặp theo tầng, xem PhasePlanCard (mobile). */
  @IsOptional() @IsString() floorLabel?: string;
}

class AddPhaseDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
}

class ReorderPhasesDto {
  @IsArray() @IsString({ each: true }) phaseIds: string[];
}

class AdjustDurationDto {
  @IsInt() @Min(1) plannedDurationDays: number;
}

@UseGuards(AuthGuard)
@Controller()
export class ProjectsController {
  constructor(private projects: ProjectsService) {}

  @Get('projects')
  list(@CurrentUser() user: AuthUser) {
    return this.projects.listMine(user.sub);
  }

  /** Checklist "Chọn bước thi công áp dụng" lúc tạo dự án — không cần projectId vì dự án chưa tồn tại. */
  @Get('templates/default/phases')
  templatePhases(@Query('contractType') contractType?: ContractType) {
    return this.projects.getTemplatePhases(contractType ?? 'THO_VA_NHAN_CONG_HOAN_THIEN');
  }

  @Post('projects')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProjectDto) {
    return this.projects.create(user.sub, dto);
  }

  /** Chỉ chủ nhà (OWNER) được xoá dự án — xem ProjectsService.deleteProject. */
  @Delete('projects/:id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.projects.deleteProject(id, user.sub);
  }

  @Post('projects/:id/members')
  addMember(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: AddMemberDto,
  ) {
    return this.projects.addMember(id, user.sub, dto);
  }

  @Post('projects/:id/plan/approve')
  approvePlan(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.projects.approvePlan(id, user.sub);
  }

  @Get('projects/:id/phases')
  phases(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.projects.getPhases(id, user.sub);
  }

  @Get('projects/:id/plan-options')
  planOptions(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.projects.getPlanOptions(id, user.sub);
  }

  @Post('projects/:id/phases')
  addPhase(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: AddPhaseDto) {
    return this.projects.addPhase(id, user.sub, dto);
  }

  @Delete('phases/:phaseId')
  removePhase(@Param('phaseId') phaseId: string, @CurrentUser() user: AuthUser) {
    return this.projects.removePhase(phaseId, user.sub);
  }

  @Patch('phases/:phaseId/duration')
  adjustDuration(
    @Param('phaseId') phaseId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: AdjustDurationDto,
  ) {
    return this.projects.adjustDuration(phaseId, user.sub, dto.plannedDurationDays);
  }

  @Post('projects/:id/phases/reorder')
  reorderPhases(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ReorderPhasesDto,
  ) {
    return this.projects.reorderPhases(id, user.sub, dto.phaseIds);
  }

  @Post('phases/:phaseId/steps')
  addStep(
    @Param('phaseId') phaseId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: AddStepDto,
  ) {
    return this.projects.addNegotiatedStep(phaseId, user.sub, dto);
  }

  @Delete('steps/:stepId')
  removeStep(@Param('stepId') stepId: string, @CurrentUser() user: AuthUser) {
    return this.projects.removeStep(stepId, user.sub);
  }
}
