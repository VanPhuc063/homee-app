import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ProjectRole } from '@prisma/client';
import { AuthGuard, AuthUser, CurrentUser } from '../auth/auth.guard';
import { DirectoryService } from './directory.service';

@UseGuards(AuthGuard)
@Controller('directory')
export class DirectoryController {
  constructor(private directory: DirectoryService) {}

  @Get('candidates')
  list(@Query('role') role?: ProjectRole, @Query('search') search?: string) {
    return this.directory.listCandidates(role, search);
  }

  @Get('candidates/:id')
  detail(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.directory.getCandidate(id, user.sub);
  }
}
