import type { CameraOptions, ImagePickerResponse } from 'react-native-image-picker';

/**
 * Bản web của react-native-image-picker chỉ hỗ trợ ảnh và camera là overlay webcam — thay bằng
 * <input type="file">: trên điện thoại, `capture` mở thẳng camera sau, nhận cả ảnh lẫn video.
 */
function pick(options: CameraOptions, camera: boolean): Promise<ImagePickerResponse> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = options.mediaType === 'photo' ? 'image/*' : options.mediaType === 'video' ? 'video/*' : 'image/*,video/*';
    if (camera) input.setAttribute('capture', 'environment');
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve({ didCancel: true });
      resolve({ assets: [{ uri: URL.createObjectURL(f), type: f.type, fileName: f.name, fileSize: f.size }] });
    };
    input.oncancel = () => resolve({ didCancel: true });
    input.click();
  });
}

export const launchCamera = (o: CameraOptions) => pick(o, true);
export const launchImageLibrary = (o: CameraOptions) => pick(o, false);
