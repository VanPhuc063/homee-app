import { Controller, Get, Header } from '@nestjs/common';
import { ADMIN_HTML } from './admin-page';

/** Trang admin (1 file HTML, gọi API /admin/* bằng token đăng nhập email + mật khẩu). */
@Controller('admin')
export class AdminPageController {
  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  // Chặn nhúng iframe và đoán MIME — trang có thao tác tiền.
  @Header('X-Frame-Options', 'DENY')
  @Header('X-Content-Type-Options', 'nosniff')
  page() {
    return ADMIN_HTML;
  }
}
