import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from '@/storage';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { api, sendWorkforceReport, uploadEvidence, uploadMaterialLog } from '@/api/client';

/**
 * Hàng đợi thao tác khi công trường mất sóng (review 10.6 #13): ảnh/video bằng chứng, vật tư, điểm
 * danh + báo cáo nhân công, comment. Lỗi do mạng thì lưu vào hàng đợi (file đính kèm copy sang thư
 * mục bền của app — camera để file ở cache, có thể bị dọn) và tự gửi lại khi app mở/quay lại
 * foreground. Lỗi nghiệp vụ (không quyền, hết hạn...) thì báo ngay, không xếp hàng.
 */
type File = { uri: string; contentType: string };
export type Job =
  | { kind: 'evidence'; stepId: string; file: File }
  | { kind: 'material'; projectId: string; dto: Parameters<typeof uploadMaterialLog>[1]; files: File[] }
  | { kind: 'workforce'; projectId: string; attendance?: unknown; files: File[] }
  | { kind: 'json'; path: string; method: string; body: unknown };

interface Pending {
  id: string;
  job: Job;
  createdAt: number;
}

const KEY = 'upload-queue';
const DIR = `${FileSystem.documentDirectory}pending-uploads/`;
let listeners: ((n: number) => void)[] = [];
let flushing = false;

async function read(): Promise<Pending[]> {
  try {
    const items = JSON.parse((await SecureStore.getItemAsync(KEY)) ?? '[]') as (Pending | (Pending & { stepId: string; uri: string; contentType: string }))[];
    // Bản cũ chỉ lưu ảnh bằng chứng dạng {stepId, uri, contentType}.
    return items.map((it) =>
      'job' in it && it.job ? it : { id: it.id, createdAt: it.createdAt, job: { kind: 'evidence', stepId: (it as { stepId: string }).stepId, file: { uri: (it as { uri: string }).uri, contentType: (it as { contentType: string }).contentType } } },
    );
  } catch {
    return [];
  }
}
async function write(items: Pending[]) {
  await SecureStore.setItemAsync(KEY, JSON.stringify(items));
  listeners.forEach((l) => l(items.length));
}

/** fetch ném TypeError "Network request failed" khi không có mạng — khác lỗi HTTP từ server. */
export function isNetworkError(e: unknown) {
  const msg = (e as Error)?.message ?? '';
  return e instanceof TypeError || /network request failed|network error|timed out/i.test(msg);
}

async function persist(file: File, id: string, i: number): Promise<File> {
  // ponytail: web giữ blob URL — chỉ sống tới khi đóng tab; lưu IndexedDB nếu cần chờ qua reload.
  if (Platform.OS === 'web') return file;
  await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => undefined);
  const dest = `${DIR}${id}-${i}.${file.contentType.split('/')[1] ?? 'bin'}`;
  await FileSystem.copyAsync({ from: file.uri, to: dest });
  return { ...file, uri: dest };
}

function filesOf(job: Job): File[] {
  if (job.kind === 'evidence') return [job.file];
  if (job.kind === 'json') return [];
  return job.files;
}

/** Lưu 1 thao tác vào hàng đợi (copy file đính kèm sang thư mục bền). */
export async function enqueue(job: Job) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let saved: Job = job;
  if (job.kind === 'evidence') saved = { ...job, file: await persist(job.file, id, 0) };
  else if (job.kind === 'material' || job.kind === 'workforce') {
    saved = { ...job, files: await Promise.all(job.files.map((f, i) => persist(f, id, i))) };
  }
  await write([...(await read()), { id, job: saved, createdAt: Date.now() }]);
}

export const enqueueEvidence = (stepId: string, uri: string, contentType: string) =>
  enqueue({ kind: 'evidence', stepId, file: { uri, contentType } });

/**
 * Chạy 1 thao tác; mất mạng thì xếp hàng thay vì báo lỗi. Trả 'sent' hoặc 'queued'.
 * Lỗi nghiệp vụ vẫn ném ra để màn hình báo như cũ.
 */
export async function runOrQueue(job: Job): Promise<'sent' | 'queued'> {
  try {
    await execute(job);
    return 'sent';
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    await enqueue(job);
    return 'queued';
  }
}

async function execute(job: Job) {
  switch (job.kind) {
    case 'evidence':
      return uploadEvidence(job.stepId, job.file.uri, job.file.contentType);
    case 'material':
      return uploadMaterialLog(job.projectId, job.dto, job.files);
    case 'workforce':
      if (job.attendance) await api(`/projects/${job.projectId}/teams/attendance`, { method: 'POST', body: job.attendance });
      return sendWorkforceReport(job.projectId, job.files);
    case 'json':
      return api(job.path, { method: job.method, body: job.body });
  }
}

/** Gửi lại các thao tác đang chờ theo thứ tự; dừng ở lỗi mạng đầu tiên. Trả số mục đã xử lý. */
export async function flushQueue(): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  let sent = 0;
  try {
    let items = await read();
    for (const it of [...items]) {
      try {
        await execute(it.job);
      } catch (e) {
        if (isNetworkError(e)) break;
        // Lỗi nghiệp vụ (bước đã đóng, hết quyền...) — bỏ khỏi hàng đợi, không thử mãi.
      }
      items = items.filter((x) => x.id !== it.id);
      await write(items);
      if (Platform.OS !== 'web') {
        await Promise.all(filesOf(it.job).map((f) => FileSystem.deleteAsync(f.uri, { idempotent: true })));
      }
      sent++;
    }
  } finally {
    flushing = false;
  }
  return sent;
}

export async function pendingCount() {
  return (await read()).length;
}

export function onQueueChange(cb: (n: number) => void) {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

/** Gọi 1 lần lúc khởi động app: thử gửi ngay + mỗi lần app quay lại foreground. */
export function startUploadQueue(onSent?: (n: number) => void) {
  const run = () => flushQueue().then((n) => n > 0 && onSent?.(n));
  run();
  const sub = AppState.addEventListener('change', (s) => s === 'active' && run());
  return () => sub.remove();
}

/** Số thao tác đang chờ gửi (cập nhật trực tiếp). */
export function usePendingUploads() {
  const [n, setN] = useState(0);
  useEffect(() => {
    pendingCount().then(setN);
    return onQueueChange(setN);
  }, []);
  return n;
}
