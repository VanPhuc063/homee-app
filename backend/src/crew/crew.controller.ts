import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ProjectRole } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AuthGuard, AuthUser, CurrentUser } from '../auth/auth.guard';
import { CrewService } from './crew.service';

class AddCrewMemberDto {
  @IsString() phone: string;
  @IsString() name: string;
  @IsOptional() @IsEnum(ProjectRole) defaultRole?: ProjectRole;
}

@UseGuards(AuthGuard)
@Controller('me/crew')
export class CrewController {
  constructor(private crew: CrewService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.crew.list(user.sub);
  }

  @Post()
  add(@CurrentUser() user: AuthUser, @Body() dto: AddCrewMemberDto) {
    return this.crew.add(user.sub, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.crew.remove(user.sub, id);
  }
}
