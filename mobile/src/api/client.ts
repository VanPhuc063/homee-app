import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { useAuth } from '../store/auth';

const BASE_URL: string =
  (Constants.expoConfig?.extra?.apiUrl as string) ?? 'http://localhost:3000';

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken, user, setSession, logout } = useAuth.getState();
  if (!refreshToken || !user) return null;
  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    await logout();
    return null;
  }
  const data = await res.json();
  await setSession(user, data.accessToken, data.refreshToken);
  return data.accessToken;
}

/** Mã lỗi backend → câu dễ hiểu (AI_PREMIUM_REQUIRED giữ nguyên để màn AI nhận diện). */
function friendlyError(message: string): string {
  if (message === 'PROJECT_READ_ONLY') {
    return 'Dự án đang ở chế độ chỉ xem vì đã hết dùng thử. Người tạo dự án cần gia hạn gói để tiếp tục cập nhật.';
  }
  return message;
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const { method = 'GET', body, auth = true } = options;

  const doFetch = async (token: string | null) => {
    return fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  let res = await doFetch(useAuth.getState().accessToken);
  if (res.status === 401 && auth) {
    const newToken = await refreshAccessToken();
    if (newToken) res = await doFetch(newToken);
  }
  if (!res.ok) {
    let message = `Lỗi ${res.status}`;
    try {
      const err = await res.json();
      message = friendlyError(Array.isArray(err.message) ? err.message.join('\n') : (err.message ?? message));
    } catch {
      /* noop */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

async function doUpload(path: string, form: FormData, token: string | null) {
  return fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    // Không set Content-Type thủ công — fetch/RN tự thêm multipart boundary đúng khi body là FormData.
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form,
  });
}

/** Web: FormData không nhận {uri,name,type} như RN — polyfills.web giữ lại các phần đó, ở đây tải
 * blob từ uri rồi gắn vào form thật. */
async function resolveWebFiles(form: FormData) {
  const pending = (form as unknown as { __files?: [string, { uri: string; name: string; type: string }][] }).__files ?? [];
  for (const [key, f] of pending.splice(0)) {
    const blob = await (await fetch(f.uri)).blob();
    form.append(key, new File([blob], f.name, { type: f.type }));
  }
}

/** POST multipart/form-data (upload file) — dùng chung logic refresh token 401 với `api()`. */
async function apiUpload(path: string, form: FormData): Promise<void> {
  if (Platform.OS === 'web') await resolveWebFiles(form);
  let res = await doUpload(path, form, useAuth.getState().accessToken);
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) res = await doUpload(path, form, newToken);
  }
  if (!res.ok) {
    let message = `Lỗi ${res.status}`;
    try {
      const err = await res.json();
      message = friendlyError(Array.isArray(err.message) ? err.message.join('\n') : (err.message ?? message));
    } catch {
      /* noop */
    }
    throw new Error(message);
  }
}

/**
 * Upload ảnh/video bằng chứng — file đi thẳng qua backend rồi được ghi vào Google Drive của chủ
 * nhà (dưới Homee/<công trình>/<hạng mục>). Khác với R2 trước đây (presigned URL đi thẳng từ máy
 * lên storage): ở đây bắt buộc qua backend vì chỉ backend giữ access token Drive của chủ nhà —
 * không thể đưa token đó cho máy của thầu/giám sát.
 */
export async function uploadEvidence(
  stepId: string,
  fileUri: string,
  contentType: string,
): Promise<void> {
  const form = new FormData();
  form.append('file', {
    uri: fileUri,
    name: `evidence.${contentType.split('/')[1] ?? 'bin'}`,
    type: contentType,
  } as unknown as Blob);
  form.append('type', contentType.startsWith('video') ? 'VIDEO' : 'PHOTO');
  form.append('takenAt', new Date().toISOString());
  await apiUpload(`/steps/${stepId}/evidence`, form);
}

/** Upload ảnh vật tư tập kết (cổng duyệt trước thi công) — cùng cơ chế upload qua backend với
 * evidence. `label` giờ bắt buộc: nó là khoá gộp nhóm ảnh thành 1 item để chủ nhà duyệt/từ chối
 * riêng từng loại vật tư (xem MaterialCheckService.addPhoto), không còn là ghi chú tự do. */
export async function uploadMaterialCheckPhoto(
  projectId: string,
  fileUri: string,
  contentType: string,
  label: string,
  category?: string,
  supplierName?: string,
): Promise<void> {
  const form = new FormData();
  form.append('file', {
    uri: fileUri,
    name: `material.${contentType.split('/')[1] ?? 'bin'}`,
    type: contentType,
  } as unknown as Blob);
  form.append('label', label);
  if (category) form.append('category', category);
  if (supplierName) form.append('supplierName', supplierName);
  await apiUpload(`/projects/${projectId}/material-check/photos`, form);
}

/** Chấm công công trường bằng ảnh (Nhật ký ngày) — luôn ghi cho hôm nay, check-in lại trong ngày
 * ghi đè ảnh/số lượng cũ, xem SchedulingService.postCheckIn (backend). */
export async function uploadCheckIn(
  projectId: string,
  fileUri: string,
  contentType: string,
  workerCount: number,
  note?: string,
): Promise<void> {
  const form = new FormData();
  form.append('file', {
    uri: fileUri,
    name: `checkin.${contentType.split('/')[1] ?? 'jpg'}`,
    type: contentType,
  } as unknown as Blob);
  form.append('workerCount', String(workerCount));
  if (note) form.append('note', note);
  await apiUpload(`/projects/${projectId}/daily-log/checkin`, form);
}

/** Giám sát duyệt/từ chối 1 bước — bắt buộc kèm ảnh thiết bị đo dùng để nghiệm thu ("book giám
 * sát": mọi giám sát phải có đúng thiết bị, chụp hình cho chủ đầu tư mỗi lần nghiệm thu). Chủ nhà
 * duyệt lớp 2 thì không cần ảnh — dùng `api()` POST JSON như cũ, xem step/[id].tsx. */
export async function approveStepWithEquipmentPhoto(
  stepId: string,
  decision: 'APPROVED' | 'REJECTED',
  fileUri: string,
  contentType: string,
  note?: string,
): Promise<void> {
  const form = new FormData();
  form.append('file', {
    uri: fileUri,
    name: `equipment.${contentType.split('/')[1] ?? 'jpg'}`,
    type: contentType,
  } as unknown as Blob);
  form.append('decision', decision);
  if (note) form.append('note', note);
  await apiUpload(`/steps/${stepId}/approve`, form);
}

/** Đội trưởng gửi báo cáo công việc hàng ngày cho nhà thầu — nhiều ảnh/video đính kèm (gắn trước,
 * gửi sau — xem team-checkin/[projectId].tsx). Xem TeamService.submitReport (backend). */
export async function uploadTeamReport(
  projectId: string,
  dto: { workDone: string; planTomorrow?: string; issues?: string },
  media: { uri: string; contentType: string }[],
): Promise<void> {
  const form = new FormData();
  form.append('workDone', dto.workDone);
  if (dto.planTomorrow) form.append('planTomorrow', dto.planTomorrow);
  if (dto.issues) form.append('issues', dto.issues);
  media.forEach((m, i) => {
    form.append('files', {
      uri: m.uri,
      name: `report-${i}.${m.contentType.split('/')[1] ?? 'jpg'}`,
      type: m.contentType,
    } as unknown as Blob);
  });
  await apiUpload(`/projects/${projectId}/teams/reports`, form);
}

/** Thầu báo cáo 1 loại vật tư trong Nhật ký vật tư — bắt buộc kèm ảnh hóa đơn, gắn 1+ bước thi
 * công. Xem MaterialLogService.addMaterial (backend). */
export async function uploadMaterialLog(
  projectId: string,
  dto: {
    name: string;
    quantity: number;
    unit: string;
    unitPrice?: number;
    note?: string;
    date?: string;
    stepIds: string[];
  },
  photos: { uri: string; contentType: string }[],
): Promise<void> {
  const form = new FormData();
  form.append('name', dto.name);
  form.append('quantity', String(dto.quantity));
  form.append('unit', dto.unit);
  if (dto.unitPrice != null) form.append('unitPrice', String(dto.unitPrice));
  if (dto.note) form.append('note', dto.note);
  if (dto.date) form.append('date', dto.date);
  form.append('stepIds', JSON.stringify(dto.stepIds));
  photos.forEach((p, i) => {
    form.append('files', {
      uri: p.uri,
      name: `invoice-${i}.${p.contentType.split('/')[1] ?? 'jpg'}`,
      type: p.contentType,
    } as unknown as Blob);
  });
  await apiUpload(`/projects/${projectId}/material-logs`, form);
}

/** URL xuất PDF nhật ký thi công — mở thẳng bằng WebBrowser (không qua fetch/api()) vì đây là file
 * PDF cho hệ điều hành xử lý, không phải JSON. Route công khai, xác thực qua access token hiện có
 * truyền ở query `token` (xem DailyLogExportController, backend) — hết hạn sau 30 phút như mọi
 * access token khác, đủ cho việc mở link ngay sau khi bấm. */
export function dailyLogExportUrl(projectId: string, from?: string, to?: string): string {
  const token = useAuth.getState().accessToken ?? '';
  const params = new URLSearchParams({ token, ...(from ? { from } : {}), ...(to ? { to } : {}) });
  return `${BASE_URL}/daily-log-export/${projectId}?${params.toString()}`;
}

/** Upload file tiến độ thi công (PDF/Excel) của thầu chính — AI phân tích & tạo 1 PlanChangeRequest
 * (IMPORT_SCHEDULE) để chủ nhà duyệt, xem ImportScheduleService (backend). */
export async function uploadPlanImport(
  projectId: string,
  fileUri: string,
  fileName: string,
  mimeType: string,
): Promise<void> {
  const form = new FormData();
  form.append('file', { uri: fileUri, name: fileName, type: mimeType } as unknown as Blob);
  await apiUpload(`/projects/${projectId}/plan-import`, form);
}

/** Gửi báo cáo nhân công hôm nay cho chủ đầu tư (mockup 21) — xem TeamService.sendWorkforceReport. */
export async function sendWorkforceReport(projectId: string, photos: { uri: string; contentType: string }[]): Promise<void> {
  const form = new FormData();
  photos.forEach((p, i) => {
    form.append('files', {
      uri: p.uri,
      name: `nhan-cong-${i}.${p.contentType.split('/')[1] ?? 'jpg'}`,
      type: p.contentType,
    } as unknown as Blob);
  });
  await apiUpload(`/projects/${projectId}/workforce/report`, form);
}
