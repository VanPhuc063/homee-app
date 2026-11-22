import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { consumeAiQuota, projectHasAiPremium, requireAiPremium } from './ai-premium';
import { DriveStorageService } from '../google-drive/drive-storage.service';

const MODEL = 'claude-opus-4-8';

/**
 * Tính năng AI theo Requirements v2.1 §6 — MỞ MIỄN PHÍ cho mọi user (không paywall/subscription,
 * quyết định tường minh của chủ dự án ngày 2026-09-22: đã bỏ toàn bộ hạ tầng thanh toán trước đó
 * nên không dựng lại chỉ để khoá tính năng AI). §6.2 (AI validation báo cáo theo tài liệu chuẩn
 * xây dựng — phụ lục docx riêng) CHƯA làm vì tài liệu tham chiếu đó chưa được cung cấp cho hệ
 * thống; các mục còn lại (đối chiếu tiến độ, tổng kết 8PM, tư vấn chủ nhà) đã implement.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private prisma: PrismaService,
    private scheduling: SchedulingService,
    private notifications: NotificationsService,
    private driveStorage: DriveStorageService,
  ) {}

  private async requireMember(projectId: string, userId: string, roles?: string[]) {
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!member) throw new ForbiddenException('Bạn không thuộc dự án này');
    if (roles && !roles.includes(member.role)) {
      throw new ForbiddenException('Bạn không có quyền dùng tính năng này');
    }
    return member;
  }

  private async callClaude(system: string, userText: string | unknown[], maxTokens = 4000): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new BadRequestException('Chưa cấu hình ANTHROPIC_API_KEY trên server');

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        thinking: { type: 'adaptive' },
        system,
        messages: [{ role: 'user', content: userText }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new BadRequestException(`Lỗi gọi AI: ${errText.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      stop_reason?: string;
      content: { type: string; text?: string }[];
    };
    if (data.stop_reason === 'refusal') throw new BadRequestException('AI từ chối trả lời');
    const textBlock = data.content.find((b) => b.type === 'text');
    if (!textBlock?.text) throw new BadRequestException('AI không trả về nội dung hợp lệ');
    return textBlock.text.trim();
  }

  private extractJson<T>(text: string): T {
    const cleaned = text.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      throw new BadRequestException('Không đọc được kết quả AI (không phải JSON hợp lệ)');
    }
  }

  /**
   * §6.1 — So sánh kế hoạch (baseline CPM) với tiến độ thực tế, phát hiện hạng mục trễ và trích lý
   * do trễ từ các bình luận/báo cáo gần đây. Chỉ gọi AI cho hạng mục ĐANG TRỄ — hạng mục đúng
   * hạn/chưa bắt đầu suy ra thẳng từ số liệu, không cần AI, đỡ tốn token.
   */
  async scheduleReview(projectId: string, userId: string) {
    await this.requireMember(projectId, userId, ['OWNER', 'MAIN_CONTRACTOR', 'SUPERVISOR']);
    await requireAiPremium(this.prisma, projectId);

    const [schedule, phases] = await Promise.all([
      this.scheduling.getSchedule(projectId, userId),
      this.prisma.phase.findMany({
        where: { projectId },
        orderBy: { order: 'asc' },
        include: { steps: { select: { status: true } } },
      }),
    ]);

    const byPhase = new Map<string, typeof schedule>();
    for (const s of schedule) {
      if (!byPhase.has(s.phaseId)) byPhase.set(s.phaseId, []);
      byPhase.get(s.phaseId)!.push(s);
    }

    type PhaseRow = {
      phaseCode: string;
      phaseName: string;
      status: 'NOT_STARTED' | 'ON_TIME' | 'DELAYED' | 'AHEAD' | 'DONE';
      severity: 'SEVERE' | 'MINOR' | null;
      delayDays: number;
      percentComplete: number;
      plannedStart: Date | null;
      plannedEnd: Date | null;
      actualStart: Date | null;
      actualEnd: Date | null;
      reason: string | null;
      impact: string | null;
      quote: string | null;
    };
    const rows: PhaseRow[] = [];
    const delayedPhaseIds: string[] = [];

    for (const phase of phases) {
      const steps = byPhase.get(phase.id) ?? [];
      const hasStarted = steps.some((s) => s.actualStart);
      const maxDelay = steps.reduce((max, s) => Math.max(max, s.delayDays ?? -Infinity), -Infinity);
      const delayDays = maxDelay === -Infinity ? 0 : maxDelay;
      const status: PhaseRow['status'] =
        phase.status === 'DONE'
          ? 'DONE'
          : !hasStarted
            ? 'NOT_STARTED'
            : delayDays > 0
              ? 'DELAYED'
              : delayDays < 0
                ? 'AHEAD'
                : 'ON_TIME';
      const severity: PhaseRow['severity'] =
        status === 'DELAYED' ? (delayDays >= 3 ? 'SEVERE' : 'MINOR') : null;
      const doneSteps = phase.steps.filter((s) => s.status === 'APPROVED').length;
      const percentComplete = phase.steps.length ? Math.round((doneSteps / phase.steps.length) * 100) : 0;
      const plannedStarts = steps.map((s) => s.plannedStart).filter((d): d is Date => !!d);
      const plannedEnds = steps.map((s) => s.plannedEnd).filter((d): d is Date => !!d);
      const actualStarts = steps.map((s) => s.actualStart).filter((d): d is Date => !!d);
      const actualEnds = steps.map((s) => s.actualEnd).filter((d): d is Date => !!d);
      rows.push({
        phaseCode: phase.code,
        phaseName: phase.name,
        status,
        severity,
        delayDays,
        percentComplete,
        plannedStart: plannedStarts.length ? new Date(Math.min(...plannedStarts.map((d) => d.getTime()))) : null,
        plannedEnd: plannedEnds.length ? new Date(Math.max(...plannedEnds.map((d) => d.getTime()))) : null,
        actualStart: actualStarts.length ? new Date(Math.min(...actualStarts.map((d) => d.getTime()))) : null,
        actualEnd:
          actualEnds.length === phase.steps.length && actualEnds.length > 0
            ? new Date(Math.max(...actualEnds.map((d) => d.getTime())))
            : null,
        reason: null,
        impact: null,
        quote: null,
      });
      if (status === 'DELAYED') delayedPhaseIds.push(phase.id);
    }

    const counts = {
      onTime: rows.filter((r) => r.status === 'ON_TIME').length,
      delayed: rows.filter((r) => r.status === 'DELAYED').length,
      ahead: rows.filter((r) => r.status === 'AHEAD').length,
      notStarted: rows.filter((r) => r.status === 'NOT_STARTED').length,
    };
    const overallPercent = rows.length
      ? Math.round(rows.reduce((sum, r) => sum + r.percentComplete, 0) / rows.length)
      : 0;

    if (delayedPhaseIds.length === 0) {
      return {
        counts,
        overallPercent,
        overallNarrative:
          rows.length === 0
            ? 'Dự án chưa có hạng mục nào.'
            : `Tiến độ tổng thể đạt ${overallPercent}% so với kế hoạch. Không có hạng mục nào đang trễ.`,
        rows,
      };
    }

    let aiReasons: Record<string, { reason: string; impact: string; quote: string | null }> = {};
    let overallNarrative = `Tiến độ tổng thể đạt ${overallPercent}% so với kế hoạch. ${counts.delayed} hạng mục đang trễ.`;
    await consumeAiQuota(this.prisma, projectId, userId, 'SCHEDULE_REVIEW');
    try {
      const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const delayedPhases = phases.filter((p) => delayedPhaseIds.includes(p.id));
      const contexts = await Promise.all(
        delayedPhases.map(async (p) => {
          const comments = await this.prisma.comment.findMany({
            where: { step: { phaseId: p.id }, createdAt: { gte: since } },
            orderBy: { createdAt: 'desc' },
            take: 15,
            select: { body: true, createdAt: true },
          });
          const row = rows.find((r) => r.phaseCode === p.code)!;
          return `Hạng mục ${p.code} - ${p.name}: trễ ${row.delayDays} ngày so kế hoạch.\nBáo cáo/bình luận gần đây:\n${
            comments.length
              ? comments.map((c) => `- ${c.body}`).join('\n')
              : '(không có báo cáo nào ghi chú lý do)'
          }`;
        }),
      );

      const text = await this.callClaude(
        'Bạn là trợ lý phân tích tiến độ thi công xây dựng nhà ở tại Việt Nam. Trả lời NGẮN GỌN, tiếng Việt, dành cho chủ nhà không rành kỹ thuật.',
        `Tiến độ tổng thể dự án đang đạt ${overallPercent}% so với kế hoạch (${counts.onTime} hạng mục đúng hạn, ${counts.delayed} trễ, ${counts.ahead} sớm, ${counts.notStarted} chưa bắt đầu).\n\nDưới đây là các hạng mục đang trễ tiến độ, kèm báo cáo/bình luận gần đây của thầu:\n\n${contexts.join('\n\n')}\n\nVới MỖI hạng mục trễ, hãy: (1) tóm tắt lý do trễ (trích từ báo cáo nếu có, hoặc ghi "Chưa rõ lý do — chưa có báo cáo giải trình" nếu không có báo cáo nào), (2) dự báo ảnh hưởng ngắn gọn tới tiến độ tổng thể, (3) nếu có báo cáo, trích nguyên văn 1 câu tiêu biểu nhất làm "quote" (null nếu không có báo cáo nào). Ngoài ra viết 1 "overallNarrative" 2-3 câu tổng kết chung cho TOÀN dự án kèm đề xuất. Trả lời DUY NHẤT bằng JSON, không kèm giải thích gì thêm:\n{"phases": [{"phaseCode": "B-xx", "reason": "...", "impact": "...", "quote": "..." | null}], "overallNarrative": "..."}`,
      );
      const parsed = this.extractJson<{
        phases: { phaseCode: string; reason: string; impact: string; quote: string | null }[];
        overallNarrative?: string;
      }>(text);
      aiReasons = Object.fromEntries(
        (parsed.phases ?? []).map((p) => [p.phaseCode, { reason: p.reason, impact: p.impact, quote: p.quote }]),
      );
      if (parsed.overallNarrative) overallNarrative = parsed.overallNarrative;
    } catch (e) {
      this.logger.warn(`AI schedule review thất bại: ${(e as Error).message}`);
    }

    return {
      counts,
      overallPercent,
      overallNarrative,
      rows: rows.map((r) =>
        aiReasons[r.phaseCode]
          ? {
              ...r,
              reason: aiReasons[r.phaseCode].reason,
              impact: aiReasons[r.phaseCode].impact,
              quote: aiReasons[r.phaseCode].quote,
            }
          : r,
      ),
    };
  }

  /**
   * §6.3 — Tổng kết hoạt động trong ngày, gửi cho chủ nhà lúc 20:00. Bỏ qua dự án không có hoạt
   * động gì hôm nay (không có comment/checkin mới) — tránh spam thông báo rỗng.
   */
  @Cron('0 20 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async dailySummaryCron() {
    const projects = await this.prisma.project.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });
    for (const p of projects) {
      try {
        if (!(await projectHasAiPremium(this.prisma, p.id))) continue;
        await this.runDailySummary(p.id);
      } catch (e) {
        this.logger.warn(`Tổng kết 8PM lỗi cho dự án ${p.id}: ${(e as Error).message}`);
      }
    }
  }

  private async runDailySummary(projectId: string) {
    const day = new Date();
    const dayStart = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

    const [comments, workforce, attendance, materials, rejections, project, phases] = await Promise.all([
      this.prisma.comment.findMany({
        where: { step: { phase: { projectId } }, createdAt: { gte: dayStart, lte: dayEnd } },
        include: { step: { select: { name: true, phase: { select: { code: true } } } }, author: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.workforceReport.findUnique({ where: { projectId_date: { projectId, date: dayStart } } }),
      this.prisma.teamAttendance.findMany({ where: { date: dayStart, teamWorker: { leader: { projectId } } } }),
      this.prisma.materialLog.findMany({ where: { projectId, reportDate: dayStart } }),
      this.prisma.approval.findMany({
        where: { decision: 'REJECTED', createdAt: { gte: dayStart, lte: dayEnd }, step: { phase: { projectId } } },
        include: { step: { select: { name: true, floorLabel: true, phase: { select: { code: true } } } } },
      }),
      this.prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }),
      this.prisma.phase.findMany({ where: { projectId }, include: { steps: { select: { status: true } } } }),
    ]);
    if (comments.length === 0 && attendance.length === 0 && materials.length === 0 && !workforce) return;
    if (!project) return;

    const owner = await this.prisma.projectMember.findFirst({ where: { projectId, role: 'OWNER' } });
    if (!owner) return;

    const present = workforce?.presentCount ?? attendance.filter((a) => a.present).length;
    const total = workforce?.totalCount ?? attendance.length;
    const materialTotal = materials.reduce((sum, m) => sum + (m.unitPrice ? Number(m.unitPrice) * Number(m.quantity) : 0), 0);
    const allSteps = phases.flatMap((p) => p.steps);
    const percent = allSteps.length ? Math.round((allSteps.filter((s) => s.status === 'APPROVED').length / allSteps.length) * 100) : 0;
    const reportText = comments.map((c) => `- [${c.step.phase.code} ${c.step.name}] ${c.author.name}: ${c.body}`).join('\n');
    const rejectText = rejections
      .map((r) => `- ${r.step.phase.code} ${r.step.name}${r.step.floorLabel ? ` ${r.step.floorLabel}` : ''}: giám sát đánh giá không đạt${r.note ? ` (${r.note})` : ''}`)
      .join('\n');

    // Định dạng đúng mockup 11: 5 mục, mỗi mục 1 dòng tiêu đề "**...:**", gạch đầu dòng "— ".
    const narrative = await this.callClaude(
      'Bạn là trợ lý tổng kết thi công cuối ngày cho chủ nhà không rành kỹ thuật. Tiếng Việt, ngắn gọn, chỉ dựa trên dữ liệu được cho, không bịa.',
      `Công trình "${project.name}". Tiến độ chung: ${percent}%.
Báo cáo/bình luận hôm nay:
${reportText || '(không có)'}
Đánh giá không đạt hôm nay:
${rejectText || '(không có)'}
Nhân lực: ${total ? `${present}/${total} thợ có mặt` : 'chưa điểm danh'}.
Vật tư hôm nay: ${materials.length} loại${materialTotal ? `, tổng ${materialTotal.toLocaleString('vi-VN')}đ` : ''}.

Viết đúng 5 mục theo mẫu (giữ nguyên tiêu đề, không thêm gì khác):
**Công việc hoàn thành:**
— ...
**Vấn đề phát sinh:**
— ... (ghi "Không có" nếu không có)
**Nhân lực:** ...
**Vật tư:** ...
**Dự báo:** ... (1-2 câu: tiến độ chung, rủi ro ảnh hưởng bước sau nếu có)`,
    );

    await this.notifications.notifyUser(owner.userId, {
      title: `✨ Tổng kết hôm nay — ${project.name}`,
      body: narrative,
      type: 'AI_DAILY_SUMMARY',
      data: { projectId },
    });
  }


  /** Card "Tổng kết 8PM" gần nhất (mockup Thông báo trễ) — đọc lại từ Notification đã gửi, không
   * gọi AI mới (tránh tốn thêm token chỉ để hiển thị lại thứ đã gửi). */
  async latestDailySummary(projectId: string, userId: string) {
    await this.requireMember(projectId, userId, ['OWNER', 'MAIN_CONTRACTOR', 'SUPERVISOR']);
    await requireAiPremium(this.prisma, projectId);
    const owner = await this.prisma.projectMember.findFirst({ where: { projectId, role: 'OWNER' } });
    if (!owner) return null;
    // Gửi cho chủ nhà (runDailySummary), nhưng ai xem dự án có quyền (thầu chính/giám sát) cũng
    // xem lại được cùng nội dung — không phải thông báo riêng tư của chủ nhà.
    const notif = await this.prisma.notification.findFirst({
      where: {
        userId: owner.userId,
        type: 'AI_DAILY_SUMMARY',
        data: { path: ['projectId'], equals: projectId },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!notif) return null;
    return { body: notif.body, createdAt: notif.createdAt };
  }

  /**
   * AI kiểm tra bằng chứng của 1 bước (mockup 14–15): xem ảnh đã nộp, chấm từng ảnh (góc chụp, nội
   * dung đúng bước, bất thường), liệt kê bằng chứng còn thiếu + checklist chuẩn cho bước, và gợi ý
   * câu hỏi cho chủ nhà. Kết quả lưu ở StepAiReview — gọi lại khi chưa có ảnh mới thì trả bản cũ.
   */
  async reviewStep(stepId: string, userId: string, force = false) {
    const step = await this.prisma.step.findUnique({
      where: { id: stepId },
      include: {
        phase: { select: { projectId: true, code: true, name: true, project: { select: { driveAccountId: true } } } },
        evidences: { orderBy: { createdAt: 'asc' }, take: 8 },
        aiReview: true,
      },
    });
    if (!step) throw new NotFoundException();
    const projectId = step.phase.projectId;
    await this.requireMember(projectId, userId);
    await requireAiPremium(this.prisma, projectId);

    const ids = step.evidences.map((e) => e.id);
    if (!force && step.aiReview && JSON.stringify(step.aiReview.evidenceIds) === JSON.stringify(ids)) {
      return step.aiReview.result;
    }

    await consumeAiQuota(this.prisma, projectId, userId, 'STEP_REVIEW');
    const photos = step.evidences.filter((e) => e.type === 'PHOTO');
    const videos = step.evidences.filter((e) => e.type === 'VIDEO').length;
    const images: { evidenceId: string; base64: string; mediaType: string }[] = [];
    const accountId = step.phase.project.driveAccountId;
    if (accountId) {
      for (const e of photos) {
        const img = await this.driveStorage.downloadImage(accountId, e.objectKey).catch(() => null);
        if (img) images.push({ evidenceId: e.id, ...img });
      }
    }

    const content: unknown[] = [];
    images.forEach((img, i) => {
      content.push({ type: 'text', text: `Ảnh ${i + 1} (id: ${img.evidenceId}):` });
      content.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.base64 } });
    });
    content.push({
      type: 'text',
      text: `Bước thi công: ${step.phase.code}.${step.order} "${step.name}" (hạng mục ${step.phase.name}${step.floorLabel ? `, ${step.floorLabel}` : ''}).
Tiêu chí nghiệm thu: ${step.acceptance ?? '(không có)'}.
Đã nộp ${photos.length} ảnh, ${videos} video.

Trả về DUY NHẤT JSON (không markdown) theo dạng:
{"verdict":"PASS"|"WARN"|"FAIL",
 "summary":[{"level":"OK"|"NOTE"|"WARN","text":"..."}],
 "photos":[{"evidenceId":"...","items":[{"level":"OK"|"NOTE"|"WARN","text":"..."}]}],
 "missing":[{"title":"...","detail":"..."}],
 "checklist":[{"kind":"PHOTO"|"VIDEO","label":"...","done":true|false}],
 "questions":["...","..."]}
summary: 3-4 nhận xét về ĐỘ ĐẦY ĐỦ của bằng chứng (đủ góc rộng/cận chưa, ảnh có đúng hạng mục không, có gì trông bất thường cần giám sát xem kỹ). KHÔNG khẳng định thông số (độ phẳng, độ dày, kích thước...) hay chất lượng đạt/không đạt — ảnh không đo được những thứ đó; dùng từ "có vẻ", "cần kiểm tra". verdict PASS = bằng chứng đủ, WARN = thiếu/cần xem lại, FAIL = thiếu nghiêm trọng. photos: nhận xét từng ảnh theo id. missing: bằng chứng quan trọng còn thiếu. checklist: 4-6 bằng chứng chuẩn cho bước này, done=true nếu ảnh/video đã nộp đáp ứng. questions: 2 câu chủ nhà nên hỏi thầu.`,
    });

    const text = await this.callClaude(
      'Bạn hỗ trợ kiểm tra ảnh bằng chứng của 1 bước thi công nhà ở Việt Nam. Nhiệm vụ: xem bằng chứng đã đủ chưa và chỉ ra điểm cần người kiểm tra xem kỹ. Chỉ nhận xét điều thấy được, không bịa, không đưa số đo. Không đánh giá chất lượng thi công đạt hay không — việc đó của giám sát/chủ nhà. Viết tiếng Việt ngắn gọn.',
      content,
      3000,
    );
    const result = this.extractJson<Record<string, unknown>>(text);
    await this.prisma.stepAiReview.upsert({
      where: { stepId },
      create: { stepId, evidenceIds: ids, result: result as object },
      update: { evidenceIds: ids, result: result as object, createdAt: new Date() },
    });
    return result;
  }

  /** Dự án đã mở khoá AI chưa — mobile dùng để hiện bản khoá/mở (mockup 34–35). */
  async aiStatus(projectId: string) {
    return { unlocked: await projectHasAiPremium(this.prisma, projectId) };
  }

  /** §6.4 — AI tư vấn cho chủ nhà, KHÔNG quyết định Đạt/Không đạt, chỉ gợi ý câu hỏi/giải thích. */
  async ask(projectId: string, userId: string, question: string, history: { role: 'user' | 'assistant'; text: string }[]) {
    await this.requireMember(projectId, userId, ['OWNER']);
    await requireAiPremium(this.prisma, projectId);
    if (!question?.trim()) throw new BadRequestException('Câu hỏi trống');
    await consumeAiQuota(this.prisma, projectId, userId, 'ASK');

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { phases: { orderBy: { order: 'asc' }, select: { code: true, name: true, status: true } } },
    });
    if (!project) throw new NotFoundException();

    const phasesSummary = project.phases
      .map((p) => `${p.code} ${p.name}: ${p.status}`)
      .join('\n');

    const historyText = history
      .slice(-6)
      .map((h) => `${h.role === 'user' ? 'Chủ nhà' : 'Trợ lý'}: ${h.text}`)
      .join('\n');

    const answer = await this.callClaude(
      'Bạn là trợ lý tư vấn xây dựng cho chủ nhà không rành kỹ thuật tại Việt Nam. Trả lời ngắn gọn, dễ hiểu, tiếng Việt, xưng "mình"/"bạn". TUYỆT ĐỐI KHÔNG tự ý phán quyết 1 hạng mục/bước thi công Đạt hay Không đạt — nếu được hỏi, hãy khuyên chủ nhà hỏi trực tiếp giám sát/thầu hoặc xem lại ảnh/video bằng chứng trong app.',
      `Tình trạng các hạng mục hiện tại của công trình "${project.name}":\n${phasesSummary}\n\n${historyText ? `Hội thoại trước đó:\n${historyText}\n\n` : ''}Câu hỏi mới của chủ nhà: ${question.trim()}`,
      2000,
    );
    return { answer };
  }
}
