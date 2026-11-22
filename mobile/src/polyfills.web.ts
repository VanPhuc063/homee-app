import * as Font from 'expo-font';
import { Alert, type AlertButton } from 'react-native';

// Native nhúng sẵn Feather.ttf qua plugin expo-font; web phải tự nạp.
Font.loadAsync({
  Feather: require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Feather.ttf'),
});

// Alert.alert của react-native-web là hàm rỗng — dùng hộp thoại của trình duyệt.
// ponytail: >1 nút hành động thì chỉ hỏi nút đầu qua confirm(), làm modal riêng nếu cần đủ nút.
Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
  const text = [title, message].filter(Boolean).join('\n\n');
  const cancel = buttons?.find((b) => b.style === 'cancel');
  const action = buttons?.find((b) => b.style !== 'cancel');
  if (!cancel) {
    window.alert(text);
    action?.onPress?.();
  } else if (window.confirm(action?.text ? `${text}\n\n→ ${action.text}?` : text)) action?.onPress?.();
  else cancel.onPress?.();
};

// FormData trên web không hiểu phần file dạng {uri,name,type} của RN (sẽ thành "[object Object]") —
// giữ lại để apiUpload đổi sang Blob trước khi gửi (xem resolveWebFiles ở api/client.ts).
const append = FormData.prototype.append;
FormData.prototype.append = function (this: FormData & { __files?: unknown[] }, key: string, value: unknown, name?: string) {
  if (value && typeof value === 'object' && 'uri' in value && !(value instanceof Blob)) {
    (this.__files ??= []).push([key, value]);
    return;
  }
  // Gọi 3 tham số (kể cả name=undefined) thì trình duyệt bắt value phải là Blob.
  return name === undefined ? (append as (k: string, v: string) => void).call(this, key, value as string) : append.call(this, key, value as Blob, name);
} as typeof append;
