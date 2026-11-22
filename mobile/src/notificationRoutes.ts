import type { Notification } from './types';

/**
 * Map `type` + `data` của 1 Notification sang route để bấm vào là nhảy thẳng tới màn liên quan,
 * thay vì chỉ đánh dấu đã đọc rồi thôi. `data` là JSON tự do (xem NotificationsService backend),
 * nên phải ép kiểu + kiểm tra tồn tại field trước khi dùng.
 *
 * Vài loại (PROPOSAL_CREATED/DECIDED) chưa có màn riêng ở mobile nên tạm điều hướng về tổng quan
 * dự án — sẽ trỏ đúng hơn khi màn Đề xuất vật liệu được xây.
 */
export function resolveNotificationRoute(n: Notification): string | null {
  const data = (n.data ?? {}) as Record<string, unknown>;
  const projectId = typeof data.projectId === 'string' ? data.projectId : null;
  const stepId = typeof data.stepId === 'string' ? data.stepId : null;

  switch (n.type) {
    case 'STEP_SUBMITTED':
    case 'STEP_REJECTED':
    case 'STEP_APPROVED':
    case 'MENTION':
      return stepId ? `/step/${stepId}` : null;

    case 'DEFECT_CREATED':
    case 'DEFECT_UPDATED':
      return projectId ? `/defects/${projectId}` : null;

    case 'MATERIAL_CHECK_SUBMITTED':
    case 'MATERIAL_CHECK_DECIDED':
      return projectId ? `/material-check/${projectId}` : null;

    case 'PAYMENT_CONFIRMED':
    case 'PAYMENT_ELIGIBLE':
      return projectId ? `/payments/${projectId}` : null;

    case 'PLAN_APPROVED':
    case 'PROPOSAL_CREATED':
    case 'PROPOSAL_DECIDED':
      return projectId ? `/project/${projectId}` : null;

    case 'PLAN_CHANGE_REQUESTED':
    case 'PLAN_CHANGE_APPROVED':
    case 'PLAN_CHANGE_REJECTED':
    case 'PHASE_ADDED':
    case 'PHASE_REMOVED':
    case 'STEP_ADDED':
    case 'STEP_REMOVED':
    case 'PHASE_DURATION_CHANGED':
    case 'PHASE_REORDERED':
      return projectId ? `/plan/${projectId}` : null;

    case 'DAILY_PROGRESS_REMINDER':
      return projectId ? `/project/${projectId}` : null;

    case 'INVITE_ACCEPTED':
    case 'INVITE_DECLINED':
      return projectId ? `/project/${projectId}/members` : null;

    case 'INVITE_RECEIVED':
    case 'REVIEW_RECEIVED':
      return '/profile';

    case 'TEAM_REPORT_SUBMITTED':
      return projectId ? `/teams/${projectId}` : null;

    case 'PROJECT_CHAT':
      return projectId ? `/project/${projectId}?chat=1` : null;

    case 'AI_DAILY_SUMMARY':
      return projectId ? `/ai-alerts/${projectId}` : null;

    default:
      return null;
  }
}
