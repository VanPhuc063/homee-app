import { Controller, Get, Param, Query, Res, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth.guard';
import { SchedulingService } from './scheduling.service';

/**
 * Route CÔNG KHAI (không qua AuthGuard) — mobile mở link này thẳng bằng trình duyệt/WebBrowser để
 * tải PDF (giống luồng Google Drive callback), nên không có header Authorization. Xác thực bằng
 * chính access token hiện có của user, truyền qua query `token` thay vì header — verify giống hệt
 * AuthGuard (cùng JWT_SECRET), chỉ khác cách lấy token ra khỏi request.
 */
@Controller('daily-log-export')
export class DailyLogExportController {
  constructor(
    private scheduling: SchedulingService,
    private jwt: JwtService,
  ) {}

  @Get(':projectId')
  async export(
    @Param('projectId') projectId: string,
    @Query('token') token: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Res() res: Response,
  ) {
    if (!token) throw new UnauthorizedException();
    let user: AuthUser;
    try {
      user = await this.jwt.verifyAsync<AuthUser>(token, { secret: process.env.JWT_SECRET });
    } catch {
      throw new UnauthorizedException();
    }
    const pdf = await this.scheduling.exportDailyLogPdf(projectId, user.sub, from, to);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="nhat-ky-thi-cong.pdf"');
    res.send(pdf);
  }
}
