// Web không có react-native-compressor — gửi file gốc.
export async function compressIfVideo(uri: string, _contentType: string): Promise<string> {
  return uri;
}
