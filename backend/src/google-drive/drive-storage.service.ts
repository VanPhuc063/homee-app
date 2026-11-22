import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DRIVE_RECONNECT_REQUIRED_MESSAGE, GoogleDriveService } from './google-drive.service';

const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const HOMEE_ROOT_FOLDER_NAME = 'Homee';

// Lý do Google trả về mà cách sửa duy nhất là kết nối lại OAuth (mất quyền/scope không đủ) — khác
// với invalid_grant (xử lý riêng ở GoogleDriveService.getValidAccessToken) nhưng cùng 1 cách sửa.
const PERMISSION_ERROR_REASONS = [
  'insufficientPermissions',
  'insufficientFilePermissions',
  'forbidden',
  'authError',
  'insufficientScopes',
];

/**
 * Tạo cây thư mục Homee/<tên công trình>/<ngày>/<hạng mục thi công> trong Drive của chủ nhà và
 * upload ảnh/video bằng chứng vào đúng thư mục. Ngày ở giữa (không phải trong cùng) để chủ nhà
 * duyệt Drive theo trình tự thời gian trước, rồi mới lọc theo loại (hạng mục, chấm công, vật tư...)
 * trong ngày đó — theo yêu cầu product 2026-09-23. Sau khi upload, file được set quyền "anyone with
 * the link = reader" để mọi thành viên dự án (thầu, giám sát...) xem được mà không cần chính họ có
 * quyền truy cập Drive của chủ nhà — access token của chủ nhà không bao giờ rời khỏi backend.
 */
@Injectable()
export class DriveStorageService {
  private logger = new Logger(DriveStorageService.name);

  constructor(private drive: GoogleDriveService) {}

  /** Nhãn ngày dạng YYYY-MM-DD theo giờ Việt Nam — "hôm nay" của người dùng, không phải UTC (tránh
   * upload gần nửa đêm bị lệch sang folder ngày kế/trước theo giờ UTC). */
  private todayFolderLabel(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
  }

  /**
   * Google trả lỗi dạng JSON `{error:{code,message,errors:[{reason,message}]}}` — không bao giờ
   * đẩy thẳng ra client (lộ cấu trúc nội bộ, không ai đọc hiểu được "insufficientPermissions").
   * Log đầy đủ để debug, chỉ trả về client 1 câu tiếng Việt dễ hiểu. Lỗi do mất quyền/scope thì
   * dùng ĐÚNG message `DRIVE_RECONNECT_REQUIRED_MESSAGE` — mobile khớp chuỗi này để tự hiện nút
   * "Kết nối lại Drive" ngay trong dialog lỗi (xem `showDriveUploadError`, mobile src/googleDrive.ts).
   */
  private friendlyDriveError(action: string, status: number, rawBody: string): string {
    this.logger.error(`${action} thất bại (HTTP ${status}): ${rawBody}`);
    let reason: string | undefined;
    try {
      const parsed = JSON.parse(rawBody) as { error?: { errors?: { reason?: string }[]; status?: string } };
      reason = parsed.error?.errors?.[0]?.reason ?? parsed.error?.status;
    } catch {
      // Google thỉnh thoảng trả lỗi không phải JSON (HTML, rỗng...) — bỏ qua, dùng fallback.
    }
    if (status === 401 || status === 403 || (reason && PERMISSION_ERROR_REASONS.includes(reason))) {
      return DRIVE_RECONNECT_REQUIRED_MESSAGE;
    }
    return `${action} thất bại, thử lại sau.`;
  }

  async uploadToProjectPhase(
    accountId: string,
    projectName: string,
    phaseName: string,
    filename: string,
    mimeType: string,
    buffer: Buffer,
    description?: string,
  ): Promise<{ fileId: string; thumbUrl: string; viewUrl: string }> {
    const token = await this.drive.getValidAccessToken(accountId);
    const rootId = await this.ensureRootFolder(accountId, token);
    const projectFolderId = await this.ensureFolder(token, projectName, rootId);
    const dateFolderId = await this.ensureFolder(token, this.todayFolderLabel(), projectFolderId);
    const phaseFolderId = await this.ensureFolder(token, phaseName, dateFolderId);
    const fileId = await this.uploadFile(token, phaseFolderId, filename, mimeType, buffer, description);
    await this.makeReadableByLink(token, fileId);
    return {
      fileId,
      thumbUrl: `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`,
      viewUrl: `https://drive.google.com/file/d/${fileId}/view`,
    };
  }

  /** Tải nội dung ảnh (ảnh nhỏ cỡ ~1000px) để gửi AI kiểm tra — dùng thumbnail của Drive cho nhẹ. */
  async downloadImage(accountId: string, fileId: string): Promise<{ base64: string; mediaType: string } | null> {
    const token = await this.drive.getValidAccessToken(accountId);
    const meta = await fetch(`${DRIVE_FILES_URL}/${fileId}?fields=thumbnailLink,mimeType`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!meta.ok) return null;
    const { thumbnailLink, mimeType } = (await meta.json()) as { thumbnailLink?: string; mimeType?: string };
    if (!mimeType?.startsWith('image/')) return null;
    const url = thumbnailLink ? thumbnailLink.replace(/=sd+$/, '=s1000') : `${DRIVE_FILES_URL}/${fileId}?alt=media`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return { base64: buf.toString('base64'), mediaType: res.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg' };
  }

  private async ensureRootFolder(accountId: string, token: string): Promise<string> {
    const account = await this.drive.getAccountRaw(accountId);
    if (account.rootFolderId) return account.rootFolderId;
    const id = await this.ensureFolder(token, HOMEE_ROOT_FOLDER_NAME, null);
    await this.drive.cacheRootFolderId(accountId, id);
    return id;
  }

  private async ensureFolder(token: string, name: string, parentId: string | null): Promise<string> {
    const escaped = name.replace(/'/g, "\\'");
    const parentClause = parentId ? ` and '${parentId}' in parents` : " and 'root' in parents";
    const q = `name='${escaped}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentClause}`;
    const listRes = await fetch(
      `${DRIVE_FILES_URL}?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!listRes.ok) {
      const text = await listRes.text();
      throw new BadRequestException(this.friendlyDriveError('Truy vấn thư mục Google Drive', listRes.status, text));
    }
    const listData = (await listRes.json()) as { files: { id: string }[] };
    if (listData.files?.length) return listData.files[0].id;

    const createRes = await fetch(`${DRIVE_FILES_URL}?fields=id`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : undefined,
      }),
    });
    if (!createRes.ok) {
      const text = await createRes.text();
      throw new BadRequestException(this.friendlyDriveError('Tạo thư mục Google Drive', createRes.status, text));
    }
    const created = (await createRes.json()) as { id: string };
    return created.id;
  }

  private async uploadFile(
    token: string,
    parentId: string,
    filename: string,
    mimeType: string,
    buffer: Buffer,
    description?: string,
  ): Promise<string> {
    const boundary = `homee-${Date.now()}`;
    const metadata = JSON.stringify({ name: filename, parents: [parentId], description });
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
          `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
      ),
      buffer,
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const res = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new BadRequestException(this.friendlyDriveError('Upload lên Google Drive', res.status, text));
    }
    const data = (await res.json()) as { id: string };
    return data.id;
  }

  private async makeReadableByLink(token: string, fileId: string) {
    // Không throw nếu set quyền lỗi — file vẫn upload thành công, chỉ chưa xem được qua link công
    // khai (chủ nhà vẫn xem trực tiếp trong Drive của mình bình thường).
    await fetch(`${DRIVE_FILES_URL}/${fileId}/permissions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    }).catch(() => undefined);
  }
}
