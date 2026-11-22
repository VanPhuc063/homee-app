import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ProjectRole } from '@prisma/client';
import { IsArray, IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { AuthGuard, AuthUser, CurrentUser } from '../auth/auth.guard';
import { InvitesService } from './invites.service';

class SendInviteDto {
  @IsString() inviteeId: string;
  @IsEnum(ProjectRole) role: ProjectRole;
  @IsOptional() @IsArray() assignedPhaseCodes?: string[];
  /** Chỉ có ý nghĩa với role SUPERVISOR — mời giám sát theo từng bước cụ thể thay vì cả dự án. */
  @IsOptional() @IsArray() assignedStepIds?: string[];
}

class RespondInviteDto {
  @IsBoolean() accept: boolean;
}

@UseGuards(AuthGuard)
@Controller()
export class InvitesController {
  constructor(private invites: InvitesService) {}

  @Post('projects/:id/invites')
  send(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: SendInviteDto) {
    return this.invites.send(id, user.sub, dto);
  }

  @Get('projects/:id/invites')
  listForProject(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.invites.projectInvites(id, user.sub);
  }

  @Get('me/invites')
  mine(@CurrentUser() user: AuthUser) {
    return this.invites.myInvites(user.sub);
  }

  @Post('invites/:id/respond')
  respond(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: RespondInviteDto) {
    return this.invites.respond(id, user.sub, dto.accept);
  }
}
