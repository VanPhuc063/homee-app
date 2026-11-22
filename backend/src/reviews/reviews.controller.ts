import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { AuthGuard, AuthUser, CurrentUser } from '../auth/auth.guard';
import { ReviewsService } from './reviews.service';

class CreateReviewDto {
  @IsString() revieweeId: string;
  @IsInt() @Min(1) @Max(5) rating: number;
  @IsOptional() @IsString() comment?: string;
}

@UseGuards(AuthGuard)
@Controller()
export class ReviewsController {
  constructor(private reviews: ReviewsService) {}

  @Post('projects/:id/reviews')
  create(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: CreateReviewDto) {
    return this.reviews.create(id, user.sub, dto);
  }

  @Get('projects/:id/reviews')
  listForProject(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.reviews.listForProject(id, user.sub);
  }

  @Get('me/reviews')
  mine(@CurrentUser() user: AuthUser) {
    return this.reviews.myReviews(user.sub);
  }
}
