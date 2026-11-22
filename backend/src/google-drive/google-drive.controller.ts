import { Body, Controller, Delete, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard, AuthUser, CurrentUser } from '../auth/auth.guard';
import { GoogleDriveService } from './google-drive.service';

@UseGuards(AuthGuard)
@Controller('me/google-drive')
export class GoogleDriveController {
  constructor(private googleDrive: GoogleDriveService) {}

  @Get('accounts')
  list(@CurrentUser() user: AuthUser) {
    return this.googleDrive.listAccounts(user.sub);
  }

  /** Trả về URL Google OAuth để mobile mở trong trình duyệt — xem GoogleDriveService cho lý do
   *  toàn bộ callback nằm ở backend thay vì mobile tự cầm `code`. `email` (optional) = đang kết
   *  nối LẠI 1 account cụ thể, gợi ý sẵn account đó trên màn chọn của Google. */
  @Post('start')
  async start(@CurrentUser() user: AuthUser, @Body('email') email?: string) {
    return { url: await this.googleDrive.buildAuthUrl(user.sub, email) };
  }

  @Delete('accounts/:id')
  disconnect(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.googleDrive.disconnectAccount(id, user.sub);
  }
}

function page(title: string, body: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; background: #F5F5F0; color: #1A1A1A; display: flex;
    align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; text-align: center; }
  .card { max-width: 360px; }
  h1 { font-size: 18px; margin-bottom: 8px; }
  p { color: #666; line-height: 1.5; font-size: 14px; }
</style></head>
<body><div class="card">${body}</div></body></html>`;
}

/**
 * Google redirect về đây sau khi chủ nhà đồng ý (hoặc hủy) — route CÔNG KHAI, không qua AuthGuard vì
 * đây là request từ trình duyệt của Google, không có Bearer token. Danh tính user nằm trong `state`
 * (JWT ký sẵn bởi GoogleDriveService.buildAuthUrl). Trang trả về tự chuyển hướng vào lại app qua
 * scheme `homeee://` — đây là bước RIÊNG của app (không liên quan gì tới Google), nên không bị giới
 * hạn redirect_uri như bước trên.
 */
@Controller('google-drive')
export class GoogleDriveCallbackController {
  constructor(private googleDrive: GoogleDriveService) {}

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    if (error || !code || !state) {
      res
        .status(400)
        .type('html')
        .send(
          page(
            'Kết nối thất bại',
            `<h1>Không kết nối được Google Drive</h1><p>${error ?? 'Thiếu thông tin xác thực'}. Quay lại app và thử lại.</p>`,
          ),
        );
      return;
    }
    try {
      const account = await this.googleDrive.handleCallback(code, state);
      res
        .status(200)
        .type('html')
        .send(
          page(
            'Đã kết nối Google Drive',
            `<h1>Đã kết nối ${account.email}</h1><p>Đang quay lại app…</p>` +
              // Mở từ bản web (popup) thì tự đóng; từ app thì quay về app qua scheme.
              `<script>setTimeout(function(){ if (window.opener) window.close(); else window.location.href = 'homeee://google-drive-connected'; }, 300);</script>`,
          ),
        );
    } catch (e) {
      res
        .status(400)
        .type('html')
        .send(page('Kết nối thất bại', `<h1>Có lỗi xảy ra</h1><p>${(e as Error).message}</p>`));
    }
  }
}
