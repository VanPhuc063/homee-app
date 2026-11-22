import Constants from 'expo-constants';

const MEDIA_BASE: string =
  (Constants.expoConfig?.extra?.mediaUrl as string) ?? 'https://media.homeee.vn';

/**
 * Ảnh/video công trình giờ lưu trên Google Drive của chủ nhà — objectKey là Drive fileId (không
 * chứa '/'). Dữ liệu cũ trước tính năng này vẫn là R2 key (có prefix dạng "steps/xxx/uuid.jpg").
 */
function isDriveFileId(objectKey: string): boolean {
  return !objectKey.includes('/');
}

/** URL hiển thị ảnh inline (thumbnail công khai của Drive, không cần đăng nhập). */
export function mediaThumbUrl(objectKey: string): string {
  if (isDriveFileId(objectKey)) {
    return `https://drive.google.com/thumbnail?id=${objectKey}&sz=w1600`;
  }
  return `${MEDIA_BASE}/${objectKey}`;
}

/** URL để mở file gốc (VD: bấm "Phát video") — Drive mở bằng trình xem của Drive. */
export function mediaOpenUrl(objectKey: string): string {
  if (isDriveFileId(objectKey)) {
    return `https://drive.google.com/file/d/${objectKey}/view`;
  }
  return `${MEDIA_BASE}/${objectKey}`;
}
