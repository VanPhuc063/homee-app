import {
  Body,
  CanActivate,
  Controller,
  Delete,
  ExecutionContext,
  ForbiddenException,
  Get,
  Injectable,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdPlacement, SubscriptionPlan, WithdrawalStatus } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUrl, Matches, Min, MinLength } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AdminService } from './admin.service';

/** Admin = email nằm trong ADMIN_EMAILS (phân tách bằng dấu phẩy) trên server. */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const userId = ctx.switchToHttp().getRequest().user?.sub;
    const allowed = (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const user = userId ? await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } }) : null;
    if (!user?.email || !allowed.includes(user.email.toLowerCase())) throw new ForbiddenException('Không có quyền admin');
    return true;
  }
}

class StatusDto {
  @IsEnum(WithdrawalStatus) status: WithdrawalStatus;
}

class GrantDto {
  @IsString() userId: string;
  @IsEnum(SubscriptionPlan) plan: SubscriptionPlan;
  @IsOptional() @IsInt() @Min(1) days?: number;
}

class TipDto {
  @IsString() @MinLength(1) title: string;
  @IsString() @MinLength(1) body: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() emoji?: string;
  @IsOptional() @IsInt() @Min(1) readMinutes?: number;
  @IsOptional() @IsString() phaseCode?: string;
  @IsOptional() @IsString() linkUrl?: string;
}

class ProductDto {
  @IsString() @MinLength(1) name: string;
  @IsString() @MinLength(1) category: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() emoji?: string;
  @IsNumber() @Min(0) price: number;
  @IsOptional() @IsNumber() @Min(0) originalPrice?: number;
  @IsOptional() @IsString() affiliateUrl?: string;
}

class AdDto {
  @IsString() @MinLength(1) title: string;
  @IsUrl() imageUrl: string;
  @IsOptional() @IsUrl() linkUrl?: string;
  @IsEnum(AdPlacement) placement: AdPlacement;
  @IsDateString() startsAt: string;
  @IsDateString() endsAt: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

class AdUploadDto {
  @Matches(/^image\/(jpeg|png|webp|gif)$/) contentType: string;
}

@UseGuards(AuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private admin: AdminService,
    private storage: StorageService,
  ) {}

  @Get('ads')
  ads() {
    return this.admin.listAds();
  }

  @Post('ads/upload-url')
  adUploadUrl(@Body() dto: AdUploadDto) {
    return this.storage.presignAdUpload(dto.contentType);
  }

  @Post('ads')
  createAd(@Body() dto: AdDto) {
    return this.admin.saveAd(null, dto);
  }

  @Patch('ads/:id')
  updateAd(@Param('id') id: string, @Body() dto: AdDto) {
    return this.admin.saveAd(id, dto);
  }

  @Delete('ads/:id')
  deleteAd(@Param('id') id: string) {
    return this.admin.deleteAd(id);
  }

  @Get('me')
  me() {
    return { ok: true };
  }

  @Get('withdrawals')
  withdrawals(@Query('status') status?: WithdrawalStatus) {
    return this.admin.listWithdrawals(status);
  }

  @Patch('withdrawals/:id')
  setWithdrawal(@Param('id') id: string, @Body() dto: StatusDto) {
    return this.admin.setWithdrawalStatus(id, dto.status);
  }

  @Get('users')
  users(@Query('q') q = '') {
    return this.admin.findUsers(q);
  }

  @Post('subscriptions')
  grant(@Body() dto: GrantDto) {
    return this.admin.grantSubscription(dto.userId, dto.plan, dto.days);
  }

  @Post('subscriptions/:id/cancel')
  cancel(@Param('id') id: string) {
    return this.admin.cancelSubscription(id);
  }

  @Get('tips')
  tips() {
    return this.admin.listTips();
  }

  @Post('tips')
  createTip(@Body() dto: TipDto) {
    return this.admin.saveTip(null, dto);
  }

  @Patch('tips/:id')
  updateTip(@Param('id') id: string, @Body() dto: TipDto) {
    return this.admin.saveTip(id, dto);
  }

  @Delete('tips/:id')
  deleteTip(@Param('id') id: string) {
    return this.admin.deleteTip(id);
  }

  @Get('products')
  products() {
    return this.admin.listProducts();
  }

  @Post('products')
  createProduct(@Body() dto: ProductDto) {
    return this.admin.saveProduct(null, dto);
  }

  @Patch('products/:id')
  updateProduct(@Param('id') id: string, @Body() dto: ProductDto) {
    return this.admin.saveProduct(id, dto);
  }

  @Delete('products/:id')
  deleteProduct(@Param('id') id: string) {
    return this.admin.deleteProduct(id);
  }
}
