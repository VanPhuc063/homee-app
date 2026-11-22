import { Video } from 'react-native-compressor';

/**
 * Nén video trước khi tải lên (review 10.6 #13 — công trường sóng yếu, Drive miễn phí 15GB). Ảnh
 * đã được image-picker giảm chất lượng sẵn. Nén lỗi thì gửi file gốc, không chặn người dùng.
 */
export async function compressIfVideo(uri: string, contentType: string): Promise<string> {
  if (!contentType.startsWith('video')) return uri;
  try {
    return await Video.compress(uri, { compressionMethod: 'auto' });
  } catch {
    return uri;
  }
}
