import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsArray, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AuthGuard, AuthUser, CurrentUser } from '../auth/auth.guard';
import { AiService } from './ai.service';

class AskHistoryItemDto {
  @IsIn(['user', 'assistant']) role: 'user' | 'assistant';
  @IsString() text: string;
}

class AskDto {
  @IsString() question: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AskHistoryItemDto)
  history?: AskHistoryItemDto[];
}

@UseGuards(AuthGuard)
@Controller()
export class AiController {
  constructor(private ai: AiService) {}

  @Get('projects/:id/ai/schedule-review')
  scheduleReview(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.ai.scheduleReview(id, user.sub);
  }

  @Get('projects/:id/ai/daily-summary')
  latestDailySummary(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.ai.latestDailySummary(id, user.sub);
  }

  @Post('steps/:id/ai/review')
  reviewStep(@Param('id') id: string, @CurrentUser() user: AuthUser, @Query('force') force?: string) {
    return this.ai.reviewStep(id, user.sub, force === '1');
  }

  @Get('projects/:id/ai/status')
  status(@Param('id') id: string) {
    return this.ai.aiStatus(id);
  }

  @Post('projects/:id/ai/ask')
  ask(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: AskDto) {
    return this.ai.ask(id, user.sub, dto.question, dto.history ?? []);
  }
}
