import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { AuthGuard, AuthUser, CurrentUser } from '../auth/auth.guard';
import { PaymentsService } from './payments.service';

class CreateStageDto {
  @IsString() name: string;
  @IsNumber() @Min(0) amount: number;
  @IsString() unlockAfterPhaseId: string;
}

class ExtraDto {
  @IsString() title: string;
  @IsNumber() @Min(1) amount: number;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() phaseCode?: string;
}

class DecideDto {
  @IsBoolean() approve: boolean;
}

@UseGuards(AuthGuard)
@Controller()
export class PaymentsController {
  constructor(private payments: PaymentsService) {}

  @Get('projects/:id/payment-stages')
  list(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.payments.list(id, user.sub);
  }

  @Post('projects/:id/payment-stages')
  create(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateStageDto,
  ) {
    return this.payments.createStage(id, user.sub, dto);
  }

  @Post('payment-stages/:id/confirm-paid')
  confirmPaid(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.payments.confirmPaid(id, user.sub);
  }

  @Get('projects/:id/money')
  summary(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.payments.summary(id, user.sub);
  }

  @Post('projects/:id/extra-costs')
  proposeExtra(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: ExtraDto) {
    return this.payments.proposeExtra(id, user.sub, dto);
  }

  @Post('extra-costs/:id/decide')
  decideExtra(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: DecideDto) {
    return this.payments.decideExtra(id, user.sub, dto.approve);
  }
}
