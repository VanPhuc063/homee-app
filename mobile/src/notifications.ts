import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api/client';

// Bọc try/catch vì đây là code chạy ngay lúc import module (không đợi gọi registerPushToken) —
// từ Expo SDK 53, Expo Go không còn hỗ trợ push notification native module đầy đủ, gọi thẳng có
// thể throw ngay lúc mở app (crash trước khi React kịp render) nếu đang chạy trong Expo Go thay
// vì development build. Test trong Expo Go vẫn chạy được app, chỉ là không đăng ký được push.
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch (e) {
  console.log('[push] Không thiết lập được notification handler (bình thường nếu đang chạy Expo Go):', e);
}

/**
 * Xin quyền + lấy Expo push token rồi gửi lên backend lưu theo user, để nhận thông báo khi có
 * bước mới cần duyệt, lỗi mới, ứng tiền... Chạy an toàn: nếu là giả lập (không nhận push được)
 * hoặc app chưa cấu hình EAS projectId (xem app.json > extra.eas.projectId) thì bỏ qua âm thầm,
 * không làm crash app hay chặn luồng đăng nhập.
 */
export async function registerPushToken(): Promise<void> {
  try {
    if (!Device.isDevice) return;

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) {
      console.log(
        '[push] Chưa cấu hình extra.eas.projectId trong app.json (cần tạo EAS project) — bỏ qua đăng ký push token.',
      );
      return;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    await api('/me/push-token', { method: 'POST', body: { pushToken: tokenData.data } });
  } catch (e) {
    // Không throw — đăng ký push token thất bại không được phép chặn đăng nhập/mở app.
    console.log('[push] Không đăng ký được push token:', e);
  }
}
