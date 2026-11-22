import { Logger } from '@nestjs/common';

const logger = new Logger('Mailer');

/**
 * Gửi email qua Resend HTTP API (https://resend.com/docs/api-reference/emails/send-email).
 * Cần RESEND_API_KEY + MAIL_FROM (VD "Nhật Ký Thi Công <noreply@homee.cristhedev.com>", domain đã
 * xác minh trên Resend). Chưa cấu hình thì bỏ qua — không làm hỏng thao tác chính.
 */
export async function sendMail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!key || !from) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (!res.ok) {
      logger.warn(`Gửi email lỗi ${res.status}: ${await res.text()}`);
      return false;
    }
    return true;
  } catch (e) {
    logger.warn(`Gửi email lỗi: ${(e as Error).message}`);
    return false;
  }
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Email mời tham gia dự án — người chưa có tài khoản đăng ký đúng email này sẽ thấy lời mời. */
export function inviteEmailHtml(opts: { inviterName: string; projectName: string; roleLabel: string; hasAccount: boolean }) {
  const appUrl = process.env.APP_DOWNLOAD_URL ?? 'https://homee.cristhedev.com';
  return `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#17202A">
  <h2 style="color:#16A34A">Nhật Ký Thi Công</h2>
  <p><b>${escape(opts.inviterName)}</b> mời bạn tham gia dự án <b>${escape(opts.projectName)}</b> với vai trò <b>${escape(opts.roleLabel)}</b>.</p>
  <p>${
    opts.hasAccount
      ? 'Mở app Nhật Ký Thi Công, vào Hồ sơ để chấp nhận lời mời.'
      : 'Tải app Nhật Ký Thi Công, chọn "Dùng email &amp; mật khẩu" và đăng ký bằng đúng email này — lời mời sẽ hiện ngay sau khi đăng ký.'
  }</p>
  <p><a href="${appUrl}" style="display:inline-block;background:#16A34A;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Mở Nhật Ký Thi Công</a></p>
</div>`;
}
