import { StepRelationType } from '@prisma/client';

export interface CpmStepInput {
  id: string;
  durationDays: number;
  predecessorStepId: string | null;
  predecessorRelation: StepRelationType;
  lagDays: number;
  baselineStart: Date | null;
  baselineEnd: Date | null;
  /** Sớm nhất trong các Evidence của bước — null nếu chưa có bằng chứng nào. */
  actualStart: Date | null;
  /** Thời điểm OWNER duyệt (Approval cuối cùng khiến bước thành APPROVED) — null nếu chưa xong. */
  actualEnd: Date | null;
}

export interface CpmStepResult {
  stepId: string;
  plannedStart: Date;
  plannedEnd: Date;
  baselineStart: Date | null;
  baselineEnd: Date | null;
  actualStart: Date | null;
  actualEnd: Date | null;
  /** Số ngày lệch so với baseline (dương = trễ, âm = sớm) — null nếu chưa có baseline để so. */
  delayDays: number | null;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Tính lịch CPM (forward-pass) cho toàn bộ bước của 1 dự án — mỗi bước tối đa 1 predecessor
 * (khớp cấu trúc file tiến độ thật, không cần xử lý multi-predecessor). Bước nào đã có đủ
 * actualStart+actualEnd (đã APPROVED) thì lịch = thực tế (không còn gì để dự báo); bước chưa xong
 * thì "forecast" dựa trên predecessor — nếu predecessor đã xong thật thì neo vào actualEnd của nó
 * (tự động lan truyền độ trễ xuống các bước phụ thuộc phía sau), nếu chưa thì neo vào forecast của
 * predecessor (đệ quy).
 */
export function computeSchedule(steps: CpmStepInput[], anchor: Date): CpmStepResult[] {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const resolved = new Map<string, CpmStepResult>();
  const resolving = new Set<string>();

  function resolve(stepId: string): CpmStepResult {
    const cached = resolved.get(stepId);
    if (cached) return cached;

    if (resolving.has(stepId)) {
      throw new Error(`Vòng lặp phụ thuộc phát hiện tại bước ${stepId}`);
    }
    const step = byId.get(stepId);
    if (!step) throw new Error(`Không tìm thấy bước ${stepId} trong tập tính lịch`);
    resolving.add(stepId);

    let plannedStart: Date;
    let plannedEnd: Date;

    if (step.actualStart && step.actualEnd) {
      plannedStart = step.actualStart;
      plannedEnd = step.actualEnd;
    } else if (step.actualStart) {
      // Đang thi công thật — neo start vào thực tế, end vẫn là dự báo theo duration kế hoạch.
      plannedStart = step.actualStart;
      plannedEnd = addDays(plannedStart, step.durationDays);
    } else {
      let baseStart: Date;
      if (step.predecessorStepId) {
        const pred = resolve(step.predecessorStepId);
        const predEnd = pred.actualEnd ?? pred.plannedEnd;
        if (step.predecessorRelation === 'FF') {
          const desiredEnd = addDays(predEnd, step.lagDays);
          baseStart = addDays(desiredEnd, -step.durationDays);
        } else {
          baseStart = addDays(predEnd, step.lagDays);
        }
      } else {
        baseStart = anchor;
      }
      plannedStart = baseStart;
      plannedEnd = addDays(baseStart, step.durationDays);
    }

    const effectiveEnd = step.actualEnd ?? plannedEnd;
    const delayDays = step.baselineEnd ? diffDays(effectiveEnd, step.baselineEnd) : null;

    const result: CpmStepResult = {
      stepId: step.id,
      plannedStart,
      plannedEnd,
      baselineStart: step.baselineStart,
      baselineEnd: step.baselineEnd,
      actualStart: step.actualStart,
      actualEnd: step.actualEnd,
      delayDays,
    };
    resolving.delete(stepId);
    resolved.set(stepId, result);
    return result;
  }

  for (const step of steps) resolve(step.id);
  return steps.map((s) => resolved.get(s.id)!);
}
