import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { AuthGuard, AuthUser, CurrentUser } from '../auth/auth.guard';
import { ContentService } from './content.service';

class ProposeDto {
  @IsString() offerId: string;
  @IsOptional() @IsString() note?: string;
}

class DecideDto {
  @IsBoolean() approve: boolean;
}

@UseGuards(AuthGuard)
@Controller()
export class ContentController {
  constructor(private content: ContentService) {}

  @Get('content/tips')
  tips(@Query('phaseCode') phaseCode?: string) {
    return this.content.listTips(phaseCode);
  }

  /** Quảng cáo đang chạy (active, trong khoảng ngày) — app tự lọc theo placement. */
  @Get('ads')
  ads() {
    return this.content.activeAds();
  }

  @Get('products')
  products(@Query('category') category?: string, @Query('search') search?: string) {
    return this.content.listProducts(category, search);
  }

  @Get('products/categories')
  categories() {
    return this.content.listCategories();
  }

  @Get('projects/:id/proposals')
  proposals(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.content.listProposals(id, user.sub);
  }

  @Post('projects/:id/proposals')
  propose(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: ProposeDto) {
    return this.content.propose(id, user.sub, dto);
  }

  @Post('proposals/:id/decide')
  decide(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: DecideDto) {
    return this.content.decide(id, user.sub, dto.approve);
  }
}
