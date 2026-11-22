import { useQuery } from '@tanstack/react-query';
import { Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { api } from './api/client';
import type { GoogleDriveAccount, Project } from './types';

// Google từ chối redirect URI dạng exp://... hay IP LAN (chỉ nhận https domain thật hoặc
// localhost cho client type "Web application") — nên toàn bộ OAuth callback nằm ở BACKEND với 1
// URL cố định (xem GOOGLE_DRIVE_CALLBACK_URL). Mobile chỉ cần mở trình duyệt tới URL do backend
// tạo sẵn rồi đợi trang xác nhận tự chuyển hướng về app qua scheme "homeee://" — không tự cầm
// `code` hay phải khớp redirect URI nào cả.
const RETURN_URL = 'homeee://google-drive-connected';

/** Mở luồng xin quyền Google Drive; resolve khi tab trình duyệt đóng lại (thành công hoặc huỷ).
 * `hintEmail` — đang kết nối LẠI 1 account cụ thể đã hỏng, gợi ý sẵn đúng account đó trên màn chọn
 * của Google để tránh lỡ chọn account khác (sẽ tạo account Drive mới thay vì refresh account cũ). */
export async function connectDriveFlow(hintEmail?: string): Promise<void> {
  const { url } = await api<{ url: string }>('/me/google-drive/start', {
    method: 'POST',
    body: hintEmail ? { email: hintEmail } : undefined,
  });
  await WebBrowser.openAuthSessionAsync(url, RETURN_URL);
}

export function listDriveAccounts(): Promise<GoogleDriveAccount[]> {
  return api<GoogleDriveAccount[]>('/me/google-drive/accounts');
}

export function disconnectDriveAccount(id: string): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/me/google-drive/accounts/${id}`, { method: 'DELETE' });
}

/**
 * Lỗi do tài khoản Drive (mất quyền, token hết hạn/bị thu hồi, account không hợp lệ...) — kết nối lại
 * OAuth là sửa được. Không tính "Công trình chưa liên kết..." (kết nối lại không gán được Drive cho
 * dự án cũ).
 */
export function isDriveTokenError(message: string) {
  return /google drive/i.test(message) && !/chưa liên kết/i.test(message);
}

/**
 * Hiện lỗi; nếu là lỗi Google Drive thì popup có nút "Kết nối lại Drive" ngay tại chỗ (mở lại OAuth,
 * backend upsert theo (userId, googleUserId) nên token cũ được thay, không tạo account trùng).
 * Chỉ người đã kết nối Drive của dự án mới sửa được (`canReconnect`, xem Project.canManageDrive);
 * người khác thấy lời nhắc báo người đó. Lỗi khác hiện như Alert thường.
 */
export function showDriveUploadError(
  message: string,
  canReconnect: boolean,
  onReconnected?: () => void,
  title = 'Lỗi',
) {
  if (!isDriveTokenError(message)) {
    Alert.alert(title, message);
    return;
  }
  if (!canReconnect) {
    Alert.alert(
      'Lỗi Google Drive',
      `${message}\n\nNhờ người đã kết nối Google Drive của dự án (thường là người tạo dự án) mở app và kết nối lại.`,
    );
    return;
  }
  Alert.alert('Lỗi Google Drive', message, [
    { text: 'Để sau', style: 'cancel' },
    {
      text: 'Kết nối lại Drive',
      onPress: async () => {
        try {
          await connectDriveFlow();
          Alert.alert('Đã kết nối lại', 'Thử lại thao tác vừa rồi nhé.');
          onReconnected?.();
        } catch (e) {
          Alert.alert('Kết nối thất bại', (e as Error).message);
        }
      },
    },
  ]);
}

/** Hàm báo lỗi đã gắn sẵn quyền kết nối lại Drive của người đang xem với dự án `projectId`. */
export function useDriveErrorAlert(projectId?: string, onReconnected?: () => void) {
  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: () => api<Project[]>('/projects') });
  const canReconnect = !!projects?.find((p) => p.id === projectId)?.canManageDrive;
  return (e: unknown, title?: string) => showDriveUploadError((e as Error).message, canReconnect, onReconnected, title);
}
