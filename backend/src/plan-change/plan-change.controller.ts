import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PlanChangeType } from '@prisma/client';
import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { AuthGuard, AuthUser, CurrentUser } from '../auth/auth.guard';
import { PlanChangeService } from './plan-change.service';

class CreatePlanChangeRequestDto {
  @IsIn(Object.values(PlanChangeType)) type: PlanChangeType;
  @IsObject() payload: Record<string, any>;
  @IsOptional() @IsString() note?: string;
}

class DecidePlanChangeDto {
  @IsIn(['APPROVED', 'REJECTED']) decision: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() note?: string;
}

@UseGuards(AuthGuard)
@Controller()
export class PlanChangeController {
  constructor(private planChange: PlanChangeService) {}

  @Post('projects/:id/plan-changes')
  request(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePlanChangeRequestDto,
  ) {
    return this.planChange.request(id, user.sub, dto);
  }

  @Get('projects/:id/plan-changes')
  list(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.planChange.list(id, user.sub);
  }

  @Post('plan-changes/:id/decide')
  decide(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: DecidePlanChangeDto,
  ) {
    return this.planChange.decide(id, user.sub, dto);
  }
}
