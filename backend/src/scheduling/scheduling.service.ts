import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ReportQuality } from '@prisma/client';
import { existsSync } from 'fs';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { WeatherService } from '../weather/weather.service';
import { DriveStorageService } from '../google-drive/drive-storage.service';
import { computeSchedule, CpmStepInput } from './cpm';
import { phaseInScope } from '../projects/member-scope';
import { projectHasAiPremium } from '../ai/ai-premium';

// Helvetica mặc định của pdfkit không có dấu tiếng Việt → chữ bị vỡ. Docker cài fonts-dejavu-core;
// chạy local trên Windows thì dùng Arial.
const PDF_FONT = ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 'C:/Windows/Fonts/arial.ttf'].find((f) =>
  existsSync(f),
);

type StepForSchedule = Awaited<ReturnType<SchedulingService['loadStepsForProject']>>[number];

function toDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

const CONTRACTOR_ROLES = ['MAIN_CONTRACTOR', 'SUB_CONTRACTOR'];

@Injectable()
export class SchedulingService {
  constructor(
    private prisma: PrismaService,
    private weather: WeatherService,
    private driveStorage: DriveStorageService,
  ) {}

  // Kiểm tra quyền độc lập với ProjectsService để tránh phụ thuộc vòng giữa 2 module (Projects sẽ
  // gọi ngược vào SchedulingService.captureBaseline lúc duyệt kế hoạch — xem approvePlan).
  private async requireMember(projectId: string, userId: string) {
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!member) throw new ForbiddenException('Bạn không thuộc dự án này');
    return member;
  }

  private loadStepsForProject(projectId: string) {
    return this.prisma.step.findMany({
      where: { phase: { projectId } },
      include: {
        evidences: { select: { createdAt: true } },
        approvals: { select: { level: true, decision: true, createdAt: true } },
      },
    });
  }

  private toCpmInput(steps: StepForSchedule[]): CpmStepInput[] {
    return steps.map((step) => {
      const actualStart = step.evidences.length
        ? step.evidences.reduce<Date>(
            (min, e) => (e.createdAt < min ? e.createdAt : min),
            step.evidences[0].createdAt,
          )
        : null;
      const finalApproval = step.approvals.find(
        (a) => a.level === 'OWNER' && a.decision === 'APPROVED',
      );
      return {
        id: step.id,
        durationDays: step.durationDays,
        predecessorStepId: step.predecessorStepId,
        predecessorRelation: step.predecessorRelation,
        lagDays: step.lagDays,
        baselineStart: step.baselineStart,
        baselineEnd: step.baselineEnd,
        actualStart,
        actualEnd: finalApproval?.createdAt ?? null,
      };
    });
  }

  /** Trả về lịch CPM (baseline + forecast + thực tế + số ngày trễ) cho từng bước của dự án. */
  async getSchedule(projectId: string, userId: string) {
    await this.requireMember(projectId, userId);
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException();

    const steps = await this.loadStepsForProject(projectId);
    const anchor = project.constructionStartDate ?? new Date();
    const results = computeSchedule(this.toCpmInput(steps), anchor);
    const stepMeta = new Map(steps.map((s) => [s.id, s]));

    return results.map((r) => {
      const step = stepMeta.get(r.stepId)!;
      return {
        ...r,
        stepName: step.name,
        phaseId: step.phaseId,
        floorLabel: step.floorLabel,
      };
    });
  }

  /**
   * Tổng hợp số liệu cho màn Dashboard (Tổng quan công trình) — % kế hoạch vs thực tế, số ngày
   * trễ, tiến độ từng hạng mục, vật tư, ảnh trong tuần. Chỉ tính từ dữ liệu đã có sẵn (Evidence/
   * Approval/MaterialCheck) — KHÔNG bịa số liệu cho thứ chưa capture được (VD số thợ trên công
   * trường hôm nay, ảnh có GPS) như mockup gốc của product team; những phần đó chờ tính năng Nhật
   * ký ngày (chấm công) mới có dữ liệu thật.
   */
  async getDashboard(projectId: string, userId: string) {
    await this.requireMember(projectId, userId);
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException();

    const phases = await this.prisma.phase.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
      include: {
        steps: {
          orderBy: { order: 'asc' },
          include: {
            evidences: { select: { createdAt: true } },
            approvals: { select: { level: true, decision: true, createdAt: true } },
          },
        },
      },
    });
    const orderedSteps = phases.flatMap((p) => p.steps);
    const anchor = project.constructionStartDate ?? new Date();
    const results = computeSchedule(this.toCpmInput(orderedSteps), anchor);
    const resultByStepId = new Map(results.map((r) => [r.stepId, r]));

    const firstStep = orderedSteps[0];
    const lastStep = orderedSteps[orderedSteps.length - 1];
    const totalDays =
      firstStep && lastStep
        ? Math.max(
            1,
            Math.round(
              ((resultByStepId.get(lastStep.id)?.baselineEnd ?? resultByStepId.get(lastStep.id)!.plannedEnd).getTime() -
                (resultByStepId.get(firstStep.id)?.baselineStart ?? anchor).getTime()) /
                (1000 * 60 * 60 * 24),
            ),
          )
        : 0;
    const elapsedDays = Math.max(
      0,
      Math.round((Date.now() - anchor.getTime()) / (1000 * 60 * 60 * 24)),
    );
    const plannedPercent = totalDays > 0 ? Math.min(100, (elapsedDays / totalDays) * 100) : 0;

    const totalDuration = orderedSteps.reduce((sum, s) => sum + s.durationDays, 0);
    const doneDuration = orderedSteps
      .filter((s) => s.status === 'APPROVED')
      .reduce((sum, s) => sum + s.durationDays, 0);
    const actualPercent = totalDuration > 0 ? (doneDuration / totalDuration) * 100 : 0;

    const contractualHandoverDate = lastStep ? resultByStepId.get(lastStep.id)!.baselineEnd : null;
    const forecastHandoverDate = lastStep ? resultByStepId.get(lastStep.id)!.plannedEnd : null;
    const forecastDelayDays = lastStep ? resultByStepId.get(lastStep.id)!.delayDays : null;

    // Bước đang trễ nhiều nhất trong các bước CHƯA xong (đã bắt đầu hoặc tới lượt nhưng quá hạn) —
    // dùng cảnh báo trên Dashboard. "Số việc phía sau bị ảnh hưởng" = số bước còn lại trong chuỗi
    // tuần tự sau bước này (đúng với mô hình mặc định hiện tại — 1 chuỗi tuyến tính; khi có nhánh
    // song song theo tầng thật sự sau này sẽ cần duyệt đồ thị phụ thuộc thay vì đếm theo vị trí).
    let mostDelayedStep: {
      stepId: string;
      name: string;
      delayDays: number;
      downstreamAffectedCount: number;
    } | null = null;
    orderedSteps.forEach((step, index) => {
      if (step.status === 'APPROVED') return;
      const delay = resultByStepId.get(step.id)?.delayDays;
      if (delay != null && delay > 0 && (!mostDelayedStep || delay > mostDelayedStep.delayDays)) {
        mostDelayedStep = {
          stepId: step.id,
          name: step.name,
          delayDays: delay,
          downstreamAffectedCount: orderedSteps.length - index - 1,
        };
      }
    });

    const materialCheck = await this.prisma.materialCheck.findUnique({
      where: { projectId },
      include: { items: { select: { status: true } } },
    });
    const materials = {
      total: materialCheck?.items.length ?? 0,
      approved: materialCheck?.items.filter((i) => i.status === 'APPROVED').length ?? 0,
      pending: materialCheck?.items.filter((i) => i.status === 'PENDING').length ?? 0,
      rejected: materialCheck?.items.filter((i) => i.status === 'REJECTED').length ?? 0,
    };

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const weeklyEvidenceCount = orderedSteps.reduce(
      (sum, s) => sum + s.evidences.filter((e) => e.createdAt >= weekAgo).length,
      0,
    );
    const acceptedStepsCount = orderedSteps.filter((s) => s.status === 'APPROVED').length;

    return {
      projectName: project.name,
      address: project.address,
      totalDays,
      elapsedDays,
      plannedPercent,
      actualPercent,
      deviationPercent: actualPercent - plannedPercent,
      phasesTotal: phases.length,
      phasesDone: phases.filter((p) => p.status === 'DONE').length,
      contractualHandoverDate,
      forecastHandoverDate,
      forecastDelayDays,
      materials,
      weeklyEvidenceCount,
      acceptedStepsCount,
      totalStepsCount: orderedSteps.length,
      mostDelayedStep,
      phases: phases.map((p) => {
        const total = p.steps.length;
        const done = p.steps.filter((s) => s.status === 'APPROVED').length;
        return {
          id: p.id,
          code: p.code,
          name: p.name,
          status: p.status,
          percent: total > 0 ? (done / total) * 100 : 0,
          stepsDone: done,
          stepsTotal: total,
        };
      }),
    };
  }

  /**
   * Chụp lại lịch CPM hiện tại thành baseline cố định cho mọi bước của dự án — gọi đúng 1 lần lúc
   * duyệt kế hoạch (xem ProjectsService.approvePlan). Baseline là mốc so sánh "kế hoạch gốc", không
   * đổi sau đó dù lịch dự báo (forecast) có thay đổi theo tiến độ thực tế.
   */
  async captureBaseline(projectId: string, anchor: Date) {
    const steps = await this.loadStepsForProject(projectId);
    const results = computeSchedule(this.toCpmInput(steps), anchor);
    await this.prisma.$transaction(
      results.map((r) =>
        this.prisma.step.update({
          where: { id: r.stepId },
          data: { baselineStart: r.plannedStart, baselineEnd: r.plannedEnd },
        }),
      ),
    );
  }

  /**
   * Gỡ mọi liên kết predecessor đang trỏ vào các bước sắp bị xoá — BẮT BUỘC gọi trước khi xoá
   * Step/Phase, vì predecessorStepId là khoá ngoại không có onDelete cascade (mặc định Postgres sẽ
   * chặn xoá nếu còn bước khác tham chiếu tới). Gọi `relinkSequentialSchedule` ngay sau khi xoá để
   * chuỗi lịch được nối lại liền mạch cho các bước còn lại.
   */
  async clearPredecessorLinks(stepIds: string[]) {
    if (stepIds.length === 0) return;
    await this.prisma.step.updateMany({
      where: { predecessorStepId: { in: stepIds } },
      data: { predecessorStepId: null },
    });
  }

  /**
   * Dựng lại chuỗi phụ thuộc mặc định cho toàn bộ bước của dự án — bước N nối tiếp bước N-1 theo
   * đúng thứ tự (phase.order, step.order) hiện tại, xuyên suốt cả dự án (không dừng ở ranh giới
   * hạng mục). Đây là giá trị mặc định hợp lý khi người dùng chưa tự tay cấu hình phụ thuộc/song
   * song theo tầng — tái tạo đúng hành vi "mở tuần tự" hiện có nhưng bằng ngày tháng thật, để
   * SchedulingService có gì đó để tính thay vì mọi bước đều neo vào hôm nay. Gọi lại mỗi khi cấu
   * trúc hạng mục/bước thay đổi (thêm/xoá/sắp xếp lại) để chuỗi luôn khớp thứ tự mới nhất.
   */
  async relinkSequentialSchedule(projectId: string) {
    const phases = await this.prisma.phase.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
      include: { steps: { orderBy: { order: 'asc' } } },
    });

    let previousStepId: string | null = null;
    const updates: { id: string; durationDays: number; predecessorStepId: string | null }[] = [];
    for (const phase of phases) {
      const stepCount = phase.steps.length;
      if (stepCount === 0) continue;
      const durationDays = Math.max(1, Math.round(phase.plannedDurationDays / stepCount));
      for (const step of phase.steps) {
        updates.push({ id: step.id, durationDays, predecessorStepId: previousStepId });
        previousStepId = step.id;
      }
    }

    await this.prisma.$transaction(
      updates.map((u) =>
        this.prisma.step.update({
          where: { id: u.id },
          data: { durationDays: u.durationDays, predecessorStepId: u.predecessorStepId },
        }),
      ),
    );
  }

  /**
   * Nhật ký ngày — cho 1 ngày cụ thể (mặc định hôm nay), trả về: % kế hoạch/thực tế toàn dự án
   * (giống Dashboard), thời tiết, và danh sách bước "đang tới lượt" đúng ngày đó theo lịch CPM
   * (plannedStart..plannedEnd bao trùm ngày này) HOẶC vẫn đang mở/chưa xong (để không bỏ sót việc
   * trễ hạn). Mỗi bước kèm % tiến độ mới nhất thầu báo cáo + toàn bộ báo cáo/bình luận trong ngày.
   */
  async getDailyLog(projectId: string, userId: string, dateStr?: string) {
    const member = await this.requireMember(projectId, userId);
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException();

    const day = toDateOnly(dateStr ? new Date(dateStr) : new Date());
    const dayEnd = new Date(day.getTime() + 24 * 60 * 60 * 1000 - 1);

    const phases = await this.prisma.phase.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
      include: {
        steps: {
          orderBy: { order: 'asc' },
          include: {
            evidences: { select: { createdAt: true, type: true } },
            approvals: { select: { level: true, decision: true, createdAt: true } },
            comments: {
              where: { createdAt: { gte: day, lte: dayEnd } },
              orderBy: { createdAt: 'asc' },
              include: { author: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });
    const orderedSteps = phases.flatMap((p) => p.steps);
    const anchor = project.constructionStartDate ?? new Date();
    const results = computeSchedule(this.toCpmInput(orderedSteps), anchor);
    const resultByStepId = new Map(results.map((r) => [r.stepId, r]));

    const firstStep = orderedSteps[0];
    const lastStep = orderedSteps[orderedSteps.length - 1];
    const totalDays =
      firstStep && lastStep
        ? Math.max(
            1,
            Math.round(
              ((resultByStepId.get(lastStep.id)?.baselineEnd ??
                resultByStepId.get(lastStep.id)!.plannedEnd
              ).getTime() -
                (resultByStepId.get(firstStep.id)?.baselineStart ?? anchor).getTime()) /
                (1000 * 60 * 60 * 24),
            ),
          )
        : 0;
    const dayIndex = Math.max(
      1,
      Math.round((day.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24)) + 1,
    );
    const weekNumber = Math.ceil(dayIndex / 7);

    const totalDuration = orderedSteps.reduce((sum, s) => sum + s.durationDays, 0);
    const doneDuration = orderedSteps
      .filter((s) => s.status === 'APPROVED')
      .reduce((sum, s) => sum + s.durationDays, 0);
    const actualPercent = totalDuration > 0 ? (doneDuration / totalDuration) * 100 : 0;
    const elapsedForPlanned = Math.max(
      0,
      Math.round((day.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24)),
    );
    const plannedPercent = totalDays > 0 ? Math.min(100, (elapsedForPlanned / totalDays) * 100) : 0;
    const projectDelayDays = lastStep ? resultByStepId.get(lastStep.id)!.delayDays : null;

    const weather = await this.weather.getForDate(
      { id: project.id, address: project.address },
      day,
    );

    const checkIns = await this.prisma.attendanceCheckIn.findMany({
      where: { projectId, date: day },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, name: true } } },
    });

    // Nhật ký ngày giờ do THẦU tự chọn báo cáo gì hôm nay (xem pickStepForDailyLog), không còn để
    // lịch CPM tự suy — chọn 1 lần thì hiện lại mỗi ngày tiếp theo tới khi bước APPROVED (xong hẳn)
    // mới rớt khỏi danh sách, khỏi phải chọn lại mỗi ngày cho việc đang làm dở.
    const activeSteps = orderedSteps.filter(
      (step) => step.dailyLogActive && step.status !== 'APPROVED',
    );
    // Nguồn để thầu chọn thêm việc báo cáo hôm nay — mọi bước đang mở/bị từ chối làm lại, không
    // giới hạn theo lịch CPM (thầu tự quyết hôm nay làm gì), trừ bước đã chọn rồi. Thầu phụ chỉ
    // thấy đúng hạng mục được gán — khớp quyền pick thật sự (requireContractorForStep), tránh hiện
    // ra lựa chọn mà bấm vào sẽ bị từ chối.
    const pickablePhases =
      member.role === 'SUB_CONTRACTOR'
        ? phases.filter((p) => phaseInScope(member, p.code))
        : phases;
    const pickableSteps = pickablePhases.flatMap((p) =>
      p.steps
        .filter((s) => ['OPEN', 'REJECTED'].includes(s.status) && !s.dailyLogActive)
        .map((s) => ({
          stepId: s.id,
          name: s.name,
          phaseId: p.id,
          phaseCode: p.code,
          phaseName: p.name,
          status: s.status,
        })),
    );

    // Dùng để gắn tên/mã hạng mục vào từng bước — mobile nhóm thẻ "Báo cáo" theo hạng mục (giống
    // mockup "B-16: Tô trát tường — 3/4 bước nhỏ hoàn thành") thay vì liệt kê bước rời rạc.
    const phaseByStepId = new Map(
      phases.flatMap((p) => p.steps.map((s) => [s.id, { code: p.code, name: p.name }] as const)),
    );

    const stepsWithReports = await Promise.all(
      activeSteps.map(async (step) => {
        const r = resultByStepId.get(step.id)!;
        const latestProgress = await this.prisma.comment.findFirst({
          where: { stepId: step.id, progressPercent: { not: null } },
          orderBy: { createdAt: 'desc' },
        });
        const phaseInfo = phaseByStepId.get(step.id);
        // Số ảnh/video upload TRONG NGÀY đang xem (không phải tổng từ trước tới giờ) — khớp chip
        // "📷 6 · 🎥 1" trên thẻ hạng mục gộp ở mobile. evidences fetch không lọc theo ngày (còn
        // dùng tính actualStart cho CPM ở nơi khác) nên lọc lại ở đây thay vì query riêng.
        const evidencesToday = step.evidences.filter((e) => e.createdAt >= day && e.createdAt <= dayEnd);
        return {
          stepId: step.id,
          name: step.name,
          phaseId: step.phaseId,
          phaseCode: phaseInfo?.code ?? '',
          phaseName: phaseInfo?.name ?? '',
          floorLabel: step.floorLabel,
          status: step.status,
          plannedStart: r.plannedStart,
          plannedEnd: r.plannedEnd,
          delayDays: r.delayDays,
          latestProgressPercent: latestProgress?.progressPercent ?? null,
          photoCountToday: evidencesToday.filter((e) => e.type === 'PHOTO').length,
          videoCountToday: evidencesToday.filter((e) => e.type === 'VIDEO').length,
          reports: step.comments.map((c) => ({
            id: c.id,
            body: c.body,
            progressPercent: c.progressPercent,
            qualityDecision: c.qualityDecision,
            createdAt: c.createdAt,
            author: c.author,
          })),
        };
      }),
    );

    return {
      date: day.toISOString(),
      dayIndex,
      totalDays,
      weekNumber,
      plannedPercent,
      actualPercent,
      deviationPercent: actualPercent - plannedPercent,
      projectDelayDays,
      weather,
      steps: stepsWithReports,
      pickableSteps,
      checkIns: checkIns.map((c) => ({
        id: c.id,
        userId: c.submittedBy,
        userName: c.user.name,
        workerCount: c.workerCount,
        objectKey: c.objectKey,
        note: c.note,
        createdAt: c.createdAt,
      })),
      totalWorkerCount: checkIns.reduce((sum, c) => sum + c.workerCount, 0),
    };
  }

  /**
   * Xuất PDF nhật ký ngày cho 1 khoảng ngày — mỗi ngày có báo cáo liệt kê hạng mục/bước đã báo
   * cáo trong ngày đó (tên bước + mã hạng mục, % tiến độ, ghi chú từng người), cộng số thợ chấm
   * công. Chủ nhà xem lại "ngày X làm hạng mục gì" mà không cần mở app — xem yêu cầu product
   * 2026-09 ("stick chọn khâu nào... xuất bảng PDF ra để xem nhật ký hằng ngày").
   */
  async exportDailyLogPdf(
    projectId: string,
    userId: string,
    fromStr?: string,
    toStr?: string,
  ): Promise<Buffer> {
    await this.requireMember(projectId, userId);
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException();

    const to = toDateOnly(toStr ? new Date(toStr) : new Date());
    const from = toDateOnly(
      fromStr
        ? new Date(fromStr)
        : (project.constructionStartDate ?? new Date(to.getTime() - 13 * 86_400_000)),
    );
    if (from > to) throw new BadRequestException('Ngày bắt đầu phải trước ngày kết thúc');
    const rangeEnd = new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1);

    const comments = await this.prisma.comment.findMany({
      where: { createdAt: { gte: from, lte: rangeEnd }, step: { phase: { projectId } } },
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { name: true } },
        step: { select: { name: true, phase: { select: { code: true } } } },
      },
    });
    const checkIns = await this.prisma.attendanceCheckIn.findMany({
      where: { projectId, date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
      include: { user: { select: { name: true } } },
    });

    // Gói AI: kèm tổng kết 8PM của từng ngày (lưu dưới dạng Notification gửi chủ nhà — AiService.runDailySummary).
    const aiSummaries = new Map<string, string>();
    if (await projectHasAiPremium(this.prisma, projectId)) {
      const owner = await this.prisma.projectMember.findFirst({ where: { projectId, role: 'OWNER' } });
      const notifs = owner
        ? await this.prisma.notification.findMany({
            where: {
              userId: owner.userId,
              type: 'AI_DAILY_SUMMARY',
              data: { path: ['projectId'], equals: projectId },
              createdAt: { gte: from, lte: rangeEnd },
            },
            orderBy: { createdAt: 'asc' },
          })
        : [];
      for (const n of notifs) aiSummaries.set(toDateOnly(n.createdAt).toISOString().slice(0, 10), n.body);
    }

    const dayKey = (d: Date) => toDateOnly(d).toISOString().slice(0, 10);
    const commentsByDay = new Map<string, typeof comments>();
    for (const c of comments) {
      const k = dayKey(c.createdAt);
      if (!commentsByDay.has(k)) commentsByDay.set(k, []);
      commentsByDay.get(k)!.push(c);
    }
    const checkInsByDay = new Map<string, typeof checkIns>();
    for (const c of checkIns) {
      const k = dayKey(c.date);
      if (!checkInsByDay.has(k)) checkInsByDay.set(k, []);
      checkInsByDay.get(k)!.push(c);
    }

    const doc = new PDFDocument({ margin: 40 });
    if (PDF_FONT) doc.font(PDF_FONT);
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    doc.fontSize(16).text(`Nhật ký thi công — ${project.name}`);
    doc
      .fontSize(10)
      .fillColor('#666')
      .text(`Từ ${from.toLocaleDateString('vi-VN')} đến ${to.toLocaleDateString('vi-VN')}`);
    doc.moveDown(1);
    doc.fillColor('#000');

    let cursor = new Date(from);
    let any = false;
    while (cursor <= to) {
      const k = dayKey(cursor);
      const dayComments = commentsByDay.get(k) ?? [];
      const dayCheckIns = checkInsByDay.get(k) ?? [];
      const aiSummary = aiSummaries.get(k);
      if (dayComments.length > 0 || dayCheckIns.length > 0 || aiSummary) {
        any = true;
        doc
          .fontSize(13)
          .fillColor('#0A7B3E')
          .text(cursor.toLocaleDateString('vi-VN'), { underline: true });
        doc.fillColor('#000');
        if (dayCheckIns.length > 0) {
          const totalWorkers = dayCheckIns.reduce((sum, c) => sum + c.workerCount, 0);
          doc
            .fontSize(10)
            .text(`Nhân công: ${totalWorkers} thợ (${dayCheckIns.map((c) => c.user.name).join(', ')})`);
        }
        const byStep = new Map<string, typeof dayComments>();
        for (const c of dayComments) {
          const key = `${c.step.phase.code} — ${c.step.name}`;
          if (!byStep.has(key)) byStep.set(key, []);
          byStep.get(key)!.push(c);
        }
        for (const [stepLabel, list] of byStep) {
          doc.fontSize(11).text(stepLabel);
          for (const c of list) {
            const pct = c.progressPercent != null ? ` (${c.progressPercent}%)` : '';
            doc
              .fontSize(9)
              .fillColor('#444')
              .text(`  • ${c.author.name}${pct}: ${c.body || '(không ghi chú)'}`);
          }
          doc.fillColor('#000');
        }
        if (aiSummary) {
          doc.moveDown(0.3).fontSize(11).fillColor('#7C3AED').text('Tổng kết AI cuối ngày');
          doc.fontSize(9).fillColor('#333').text(aiSummary.replace(/\*\*/g, ''), { indent: 8 });
          doc.fillColor('#000');
        }
        doc.moveDown(0.8);
      }
      cursor = new Date(cursor.getTime() + 86_400_000);
    }
    if (!any) {
      doc.fontSize(11).fillColor('#888').text('Chưa có báo cáo nào trong khoảng thời gian này.');
    }

    doc.end();
    return done;
  }

  /**
   * Thêm 1 báo cáo/bình luận vào Nhật ký ngày cho 1 bước — thầu điền `progressPercent`, giám sát
   * điền `qualityDecision`, chủ nhà chỉ bình luận thường (không có quyền quyết định gì ở đây, khác
   * với Approval chính thức). Validate đúng người đúng việc để tránh chủ nhà tự ý báo % hay giám
   * sát tự ý báo % thay thầu.
   */
  async postDailyReport(
    stepId: string,
    userId: string,
    dto: { body?: string; progressPercent?: number; qualityDecision?: ReportQuality },
  ) {
    const step = await this.prisma.step.findUnique({
      where: { id: stepId },
      include: { phase: { select: { projectId: true } } },
    });
    if (!step) throw new NotFoundException('Không tìm thấy bước');
    const member = await this.requireMember(step.phase.projectId, userId);

    if (dto.progressPercent != null && !CONTRACTOR_ROLES.includes(member.role)) {
      throw new ForbiddenException('Chỉ thầu mới báo cáo % tiến độ');
    }
    if (dto.qualityDecision && member.role !== 'SUPERVISOR') {
      throw new ForbiddenException('Chỉ giám sát mới đánh giá đạt/chưa đạt');
    }
    if (!dto.body?.trim() && dto.progressPercent == null && !dto.qualityDecision) {
      throw new BadRequestException('Cần nội dung báo cáo');
    }
    if (dto.progressPercent != null && (dto.progressPercent < 0 || dto.progressPercent > 100)) {
      throw new BadRequestException('% tiến độ phải từ 0 đến 100');
    }

    return this.prisma.comment.create({
      data: {
        stepId,
        authorId: userId,
        body: dto.body?.trim() ?? '',
        progressPercent: dto.progressPercent,
        qualityDecision: dto.qualityDecision,
      },
      include: { author: { select: { id: true, name: true } } },
    });
  }

  /** Chỉ thầu (chính/phụ được gán hạng mục) mới chọn được bước vào Nhật ký ngày — khớp quyền nộp
   * bước (`WorkflowService.requireContractor`), tách riêng vì Scheduling không phụ thuộc Workflow. */
  private async requireContractorForStep(stepId: string, userId: string) {
    const step = await this.prisma.step.findUnique({
      where: { id: stepId },
      include: { phase: { select: { code: true, projectId: true } } },
    });
    if (!step) throw new NotFoundException('Không tìm thấy bước');
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: step.phase.projectId, userId } },
    });
    if (!member || !CONTRACTOR_ROLES.includes(member.role)) {
      throw new ForbiddenException('Chỉ thầu mới chọn việc báo cáo hôm nay');
    }
    if (!phaseInScope(member, step.phase.code)) {
      throw new ForbiddenException('Thầu phụ chỉ thao tác trên hạng mục được gán');
    }
    return step;
  }

  /** Thầu chọn 1 bước để bắt đầu báo cáo trong Nhật ký ngày — chỉ chọn được bước đang mở/bị từ
   * chối (đang có việc thật để làm), không chọn được bước LOCKED/đã xong. */
  async pickStepForDailyLog(stepId: string, userId: string) {
    const step = await this.requireContractorForStep(stepId, userId);
    if (!['OPEN', 'REJECTED'].includes(step.status)) {
      throw new BadRequestException('Chỉ chọn được bước đang mở hoặc bị từ chối làm lại');
    }
    await this.prisma.step.update({ where: { id: stepId }, data: { dailyLogActive: true } });
    return { ok: true };
  }

  /** Bỏ 1 bước ra khỏi Nhật ký ngày — lỡ chọn nhầm, không xoá báo cáo/tiến độ đã ghi trước đó. */
  async unpickStepForDailyLog(stepId: string, userId: string) {
    await this.requireContractorForStep(stepId, userId);
    await this.prisma.step.update({ where: { id: stepId }, data: { dailyLogActive: false } });
    return { ok: true };
  }

  /**
   * Chấm công công trường bằng ảnh — chỉ thầu (chính/phụ) mới check-in, luôn ghi cho HÔM NAY (không
   * cho chọn ngày khác, tránh khai khống công cho ngày đã qua). Check-in lại trong ngày ghi đè ảnh/
   * số lượng cũ (sửa nhầm) thay vì tạo dòng mới — xem @@unique trên AttendanceCheckIn.
   */
  async postCheckIn(
    projectId: string,
    userId: string,
    file: { originalname: string; mimetype: string; buffer: Buffer } | undefined,
    dto: { workerCount: number; note?: string },
  ) {
    const member = await this.requireMember(projectId, userId);
    if (!CONTRACTOR_ROLES.includes(member.role)) {
      throw new ForbiddenException('Chỉ thầu mới check-in công');
    }
    if (!file) throw new BadRequestException('Cần chụp ảnh công trường để check-in');
    if (dto.workerCount == null || dto.workerCount < 1) {
      throw new BadRequestException('Số lượng thợ phải từ 1 trở lên');
    }

    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException();
    if (!project.driveAccountId) {
      throw new BadRequestException(
        'Công trình chưa liên kết tài khoản Google Drive, chủ nhà cần chọn tài khoản lưu trữ trước',
      );
    }

    const uploaded = await this.driveStorage.uploadToProjectPhase(
      project.driveAccountId,
      project.name,
      'Chấm công',
      file.originalname || `checkin-${Date.now()}.jpg`,
      file.mimetype,
      file.buffer,
    );

    const today = toDateOnly(new Date());
    return this.prisma.attendanceCheckIn.upsert({
      where: { projectId_submittedBy_date: { projectId, submittedBy: userId, date: today } },
      create: {
        projectId,
        submittedBy: userId,
        date: today,
        workerCount: dto.workerCount,
        objectKey: uploaded.fileId,
        note: dto.note,
      },
      update: {
        workerCount: dto.workerCount,
        objectKey: uploaded.fileId,
        note: dto.note,
      },
      include: { user: { select: { id: true, name: true } } },
    });
  }

  /**
   * Báo cáo dạng timeline (tab Báo cáo): mọi báo cáo/bình luận của bước + điểm danh, mới nhất
   * trước, phân trang bằng `before` (createdAt của mục cuối trang trước).
   */
  async getReportFeed(projectId: string, userId: string, before?: string, limit = 30) {
    await this.requireMember(projectId, userId);
    const createdAt = before ? { lt: new Date(before) } : undefined;
    const [comments, checkIns] = await Promise.all([
      this.prisma.comment.findMany({
        where: { step: { phase: { projectId } }, createdAt },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          author: { select: { id: true, name: true } },
          evidence: { select: { type: true, objectKey: true } },
          step: { select: { id: true, name: true, status: true, floorLabel: true, phase: { select: { code: true, name: true } } } },
        },
      }),
      this.prisma.attendanceCheckIn.findMany({
        where: { projectId, createdAt },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: { user: { select: { id: true, name: true } } },
      }),
    ]);
    const items = [
      ...comments.map((c) => ({
        kind: 'REPORT' as const,
        id: c.id,
        createdAt: c.createdAt,
        author: c.author,
        body: c.body,
        progressPercent: c.progressPercent,
        qualityDecision: c.qualityDecision,
        evidence: c.evidence,
        step: { id: c.step.id, name: c.step.name, status: c.step.status, floorLabel: c.step.floorLabel, phaseCode: c.step.phase.code, phaseName: c.step.phase.name },
      })),
      ...checkIns.map((c) => ({
        kind: 'CHECKIN' as const,
        id: c.id,
        createdAt: c.createdAt,
        author: c.user,
        workerCount: c.workerCount,
        note: c.note,
        objectKey: c.objectKey,
      })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
    return { items, nextBefore: items.length === limit ? items[limit - 1].createdAt.toISOString() : null };
  }

}
