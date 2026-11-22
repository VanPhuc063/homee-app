import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { AuthGuard, AuthUser, CurrentUser } from '../auth/auth.guard';
import { PLAN_CATALOG } from './plan-catalog';
import { SubscriptionService } from './subscription.service';

class VerifyPurchaseDto {
  @IsIn(['ios', 'android']) platform: 'ios' | 'android';
  @IsString() productId: string;
  @IsString() transactionId: string;
  @IsOptional() @IsString() purchaseToken?: string;
}

@UseGuards(AuthGuard)
@Controller('me/subscription')
export class SubscriptionController {
  constructor(private subscription: SubscriptionService) {}

  @Get()
  getStatus(@CurrentUser() user: AuthUser) {
    return this.subscription.getStatus(user.sub);
  }

  // Bảng giá sống từ backend — mobile không hardcode tiền/tên gói, đổi giá chỉ cần sửa 1 chỗ
  // (plan-catalog.ts) không cần build lại app.
  @Get('plans')
  getPlans() {
    return PLAN_CATALOG;
  }

  @Post('verify')
  verify(@CurrentUser() user: AuthUser, @Body() dto: VerifyPurchaseDto) {
    return this.subscription.verifyPurchase(user.sub, dto);
  }
}
