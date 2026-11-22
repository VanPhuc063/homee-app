import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { AuthGuard, AuthUser, CurrentUser } from '../auth/auth.guard';
import { ActivityService } from './activity.service';

class AddNoteDto {
  @IsString() @MinLength(1) message: string;
}

@UseGuards(AuthGuard)
@Controller()
export class ActivityController {
  constructor(private activity: ActivityService) {}

  @Get('projects/:id/activity')
  list(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.activity.list(id, user.sub);
  }

  @Post('projects/:id/activity')
  addNote(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: AddNoteDto) {
    return this.activity.addNote(id, user.sub, dto.message);
  }
}
