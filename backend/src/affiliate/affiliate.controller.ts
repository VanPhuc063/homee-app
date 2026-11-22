import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsNumber, IsString, Min, IsOptional } from 'class-validator';
import { AuthGuard, AuthUser, CurrentUser } from '../auth/auth.guard';
import { AffiliateService } from './affiliate.service';

class WithdrawDto {
  @IsNumber() @Min(1) amount: number;
  @IsString() bankName: string;
  @IsString() bankAccount: string;
  @IsOptional() @IsString() accountHolder?: string;
}

@UseGuards(AuthGuard)
@Controller('affiliate')
export class AffiliateController {
  constructor(private affiliate: AffiliateService) {}

  @Get('me')
  getMyReferralInfo(@CurrentUser() user: AuthUser) {
    return this.affiliate.getMyReferralInfo(user.sub);
  }

  @Post('withdrawals')
  requestWithdrawal(@CurrentUser() user: AuthUser, @Body() dto: WithdrawDto) {
    return this.affiliate.requestWithdrawal(user.sub, dto);
  }

  @Get('withdrawals')
  listWithdrawals(@CurrentUser() user: AuthUser) {
    return this.affiliate.listMyWithdrawals(user.sub);
  }
}
