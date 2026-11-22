import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { decryptToken, encryptToken } from './crypto.util';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const DRIVE_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/drive.file'];

// Message dùng chung cho MỌI lỗi Drive mà cách sửa duy nhất là kết nối lại OAuth (refresh token
// hết hạn/bị thu hồi, hoặc mất quyền truy cập do scope/consent) — mobile (isDriveTokenError,
// src/googleDrive.ts) khớp chuỗi con này để tự hiện nút "Kết nối lại Drive" ngay trong dialog lỗi,
// thay vì chỉ hiện JSON lỗi thô của Google. Phải giữ đúng nguyên văn ở cả 2 phía.
export const DRIVE_RECONNECT_REQUIRED_MESSAGE =
  'Không làm mới được quyền truy cập Google Drive, chủ nhà cần kết nối lại tài khoản Drive trong Hồ sơ';

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
}

/**
 * Quản lý tài khoản Google Drive mà chủ nhà kết nối để lưu ảnh/video công trình (thay cho lưu ở
 * hạ tầng của app — miễn phí cho người dùng nên tránh chi phí lưu trữ dài hạn).
 *
 * OAuth client type "Web application" (có client secret) — nhưng redirect_uri KHÔNG THỂ là
 * exp://... hay 1 IP LAN vì Google chỉ chấp nhận https:// (domain công khai) hoặc http://localhost
 * cho loại client này (đã kiểm chứng thực tế: Google từ chối với lỗi "must end with a public
 * top-level domain"). Vì vậy toàn bộ callback được xử lý Ở BACKEND với 1 redirect_uri cố định
 * (`GOOGLE_DRIVE_CALLBACK_URL`, đăng ký 1 lần trong Google Console) — mobile chỉ mở trình duyệt tới
 * URL do `buildAuthUrl` tạo ra rồi đóng lại khi xong, không bao giờ tự cầm `code` hay redirect_uri.
 * Danh tính user được mã hoá vào tham số `state` (JWT ngắn hạn) để `handleCallback` biết kết nối
 * tài khoản Drive này cho ai.
 */
@Injectable()
export class GoogleDriveService {
  private clientId = process.env.GOOGLE_CLIENT_ID ?? '';
  private clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? '';
  private logger = new Logger(GoogleDriveService.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  private assertConfigured() {
    if (!this.clientId || !this.clientSecret) {
      throw new BadRequestException(
        'Server chưa cấu hình GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET, liên hệ quản trị viên',
      );
    }
  }

  private callbackUrl(): string {
    const url = process.env.GOOGLE_DRIVE_CALLBACK_URL;
    if (!url) {
      throw new BadRequestException(
        'Server chưa cấu hình GOOGLE_DRIVE_CALLBACK_URL. Cần 1 URL https công khai (VD: qua ngrok lúc dev) trỏ về route /google-drive/callback, đã đăng ký đúng URL này trong Google Console',
      );
    }
    return url;
  }

  /** Tạo URL xin quyền Google Drive — mobile chỉ cần mở URL này trong trình duyệt. `hintEmail` dùng
   * khi KẾT NỐI LẠI 1 account cụ thể đã hỏng (refresh token hết hạn/bị thu hồi) — gợi ý sẵn đúng
   * tài khoản Google đó trên màn chọn account, tránh user lỡ chọn account khác tạo ra 1
   * GoogleDriveAccount mới thay vì refresh token của account cũ (upsert theo userId+googleUserId
   * trong connectAccount chỉ fix đúng account nếu chọn đúng account Google ban đầu). */
  async buildAuthUrl(userId: string, hintEmail?: string): Promise<string> {
    this.assertConfigured();
    const state = await this.jwt.signAsync(
      { sub: userId, typ: 'drive-connect' },
      { expiresIn: '10m' },
    );
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.callbackUrl(),
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      scope: DRIVE_SCOPES.join(' '),
      state,
    });
    if (hintEmail) params.set('login_hint', hintEmail);
    return `${AUTH_URL}?${params.toString()}`;
  }

  /** Google redirect về đây sau khi chủ nhà đồng ý — hoàn tất kết nối, trả về email để hiện trên trang xác nhận. */
  async handleCallback(code: string, state: string): Promise<{ email: string }> {
    let userId: string;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; typ: string }>(state);
      if (payload.typ !== 'drive-connect') throw new Error('sai loại state');
      userId = payload.sub;
    } catch {
      throw new BadRequestException('Phiên kết nối đã hết hạn hoặc không hợp lệ, hãy thử lại từ app');
    }
    return this.connectAccount(userId, code);
  }

  private async connectAccount(userId: string, code: string) {
    this.assertConfigured();
    const tokens = await this.exchangeCode(code);
    if (!tokens.refresh_token) {
      throw new BadRequestException(
        'Google không trả về refresh token. Nếu đã kết nối trước đó, hãy thu hồi quyền truy cập app ' +
          'trong tài khoản Google (myaccount.google.com/permissions) rồi kết nối lại.',
      );
    }
    const info = await this.fetchUserInfo(tokens.access_token);
    const account = await this.prisma.googleDriveAccount.upsert({
      where: { userId_googleUserId: { userId, googleUserId: info.id } },
      update: {
        email: info.email,
        refreshTokenEncrypted: encryptToken(tokens.refresh_token),
        accessToken: tokens.access_token,
        accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
      create: {
        userId,
        googleUserId: info.id,
        email: info.email,
        refreshTokenEncrypted: encryptToken(tokens.refresh_token),
        accessToken: tokens.access_token,
        accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });
    return this.toSafeView(account);
  }

  async listAccounts(userId: string) {
    const accounts = await this.prisma.googleDriveAccount.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return accounts.map((a: { id: string; email: string; createdAt: Date }) => this.toSafeView(a));
  }

  async disconnectAccount(accountId: string, userId: string) {
    const account = await this.prisma.googleDriveAccount.findUnique({ where: { id: accountId } });
    if (!account || account.userId !== userId) throw new NotFoundException();
    const inUse = await this.prisma.project.count({ where: { driveAccountId: accountId } });
    if (inUse > 0) {
      throw new BadRequestException(
        'Tài khoản này đang được dùng cho ít nhất 1 công trình, không thể ngắt kết nối',
      );
    }
    await this.prisma.googleDriveAccount.delete({ where: { id: accountId } });
    return { ok: true };
  }

  /** Bản ghi đầy đủ (kèm rootFolderId) — dùng nội bộ bởi DriveStorageService, không lộ ra API. */
  async getAccountRaw(accountId: string) {
    const account = await this.prisma.googleDriveAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('Không tìm thấy tài khoản Google Drive đã kết nối');
    return account;
  }

  async cacheRootFolderId(accountId: string, folderId: string) {
    await this.prisma.googleDriveAccount.update({
      where: { id: accountId },
      data: { rootFolderId: folderId },
    });
  }

  /** Access token còn hạn (tự refresh nếu sắp/đã hết) — dùng nội bộ khi gọi Drive API. */
  async getValidAccessToken(accountId: string): Promise<string> {
    const account = await this.getAccountRaw(accountId);
    const stillValid =
      !!account.accessToken &&
      !!account.accessTokenExpiresAt &&
      account.accessTokenExpiresAt.getTime() - Date.now() > 60_000;
    if (stillValid) return account.accessToken!;

    this.assertConfigured();
    const refreshToken = decryptToken(account.refreshTokenEncrypted);
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      // Log nguyên nhân thật (thường là invalid_grant khi refresh token bị Google thu hồi/hết hạn —
      // hay gặp nhất khi OAuth consent screen còn ở chế độ "Testing", Google giới hạn refresh token
      // chỉ sống 7 ngày bất kể có dùng hay không) — response cũ chỉ báo chung chung, không có gì để
      // tra khi lỗi lặp lại.
      this.logger.error(
        `Refresh Google Drive token thất bại cho account ${accountId} (${account.email}): ${res.status} ${body}`,
      );
      throw new BadRequestException(DRIVE_RECONNECT_REQUIRED_MESSAGE);
    }
    const data = (await res.json()) as GoogleTokenResponse;
    await this.prisma.googleDriveAccount.update({
      where: { id: accountId },
      data: {
        accessToken: data.access_token,
        accessTokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
      },
    });
    return data.access_token;
  }

  private async exchangeCode(code: string): Promise<GoogleTokenResponse> {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: this.callbackUrl(),
        grant_type: 'authorization_code',
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new BadRequestException(`Kết nối Google Drive thất bại: ${text}`);
    }
    return (await res.json()) as GoogleTokenResponse;
  }

  private async fetchUserInfo(accessToken: string): Promise<{ id: string; email: string }> {
    const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new BadRequestException('Không lấy được thông tin tài khoản Google');
    return (await res.json()) as { id: string; email: string };
  }

  private toSafeView(account: { id: string; email: string; createdAt: Date }) {
    return { id: account.id, email: account.email, createdAt: account.createdAt };
  }
}
