import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { AuthGuard, AuthUser, CurrentUser } from '../auth/auth.guard';
import { ChatService } from './chat.service';

class SendMessageDto {
  @IsString() @MinLength(1) @MaxLength(2000) body: string;
}

@UseGuards(AuthGuard)
@Controller()
export class ChatController {
  constructor(private chat: ChatService) {}

  @Get('projects/:id/messages')
  list(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Query('before') before?: string,
    @Query('after') after?: string,
  ) {
    return this.chat.list(id, user.sub, { before, after });
  }

  @Post('projects/:id/messages')
  send(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: SendMessageDto) {
    return this.chat.send(id, user.sub, dto.body);
  }
}
