import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGO = 'aes-256-gcm';

/**
 * Refresh token Google Drive là chìa khoá ghi được vào Drive của chủ nhà mãi mãi cho tới khi họ tự
 * thu hồi quyền — không bao giờ được lưu dạng plain text. Mã hoá bằng AES-256-GCM, khoá suy ra từ
 * DRIVE_TOKEN_ENC_KEY trong .env (scrypt để luôn ra đúng 32 byte bất kể độ dài chuỗi gốc).
 */
function getKey(): Buffer {
  const secret = process.env.DRIVE_TOKEN_ENC_KEY;
  if (!secret) {
    throw new Error(
      'Thiếu DRIVE_TOKEN_ENC_KEY trong .env, cần 1 chuỗi bí mật dài để mã hoá refresh token Google Drive',
    );
  }
  return scryptSync(secret, 'homee-drive-token', 32);
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join('.');
}

export function decryptToken(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Refresh token đã lưu bị sai định dạng');
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
