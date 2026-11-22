import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PlanChangeType, ProjectRole } from '@prisma/client';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';

type PlanChangePayload = Record<string, any>;

/**
 * Đề xuất sửa kế hoạch thi công lúc PLANNING (thầu chính đề xuất) hoặc ACTIVE (cả 2 chiều đề
 * xuất/duyệt lẫn nhau) — xem PlanChangeRequest (schema.prisma). Lúc PLANNING chủ nhà vẫn sửa
 * trực tiếp qua ProjectsService, không tạo request ở đây.
 */
@Injectable()
export class PlanChangeService {
  constructor(
    private prisma: PrismaService,
    private projects: ProjectsService,
    private activity: ActivityService,
    private notifications: NotificationsService,
  ) {}

  /** Mô tả ngắn gọn nội dung thay đổi để dùng chung cho log + notification. */
  private async describe(type: PlanChangeType, payload: PlanChangePayload): Promise<string> {
    switch (type) {
      case 'ADD_PHASE':
        return payload.code
          ? `thêm hạng mục chuẩn "${payload.code}"`
          : `thêm hạng mục tuỳ chỉnh "${payload.name}"`;
      case 'REMOVE_PHASE': {
        const phase = await this.prisma.phase.findUnique({ where: { id: payload.phaseId } });
        return `xoá hạng mục "${phase?.name ?? payload.phaseId}"`;
      }
      case 'ADD_STEP':
        return `thêm bước "${payload.name}"`;
      case 'REMOVE_STEP': {
        const step = await this.prisma.step.findUnique({ where: { id: payload.stepId } });
        return `xoá bước "${step?.name ?? payload.stepId}"`;
      }
      case 'ADJUST_DURATION': {
        const phase = await this.prisma.phase.findUnique({ where: { id: payload.phaseId } });
        return `đổi thời gian dự kiến hạng mục "${phase?.name ?? payload.phaseId}" thành ${payload.plannedDurationDays} ngày`;
      }
      case 'REORDER_PHASES':
        return 'sắp xếp lại thứ tự hạng mục';
      case 'IMPORT_SCHEDULE':
        return `nhập tiến độ thi công mới từ file "${payload.sourceFileName ?? 'đã tải lên'}"`;
    }
  }

  private validatePayloadShape(type: PlanChangeType, payload: PlanChangePayload) {
    switch (type) {
      case 'ADD_PHASE':
        if (!payload.code && !String(payload.name ?? '').trim()) {
          throw new BadRequestException('Cần code (hạng mục chuẩn) hoặc name (hạng mục tuỳ chỉnh)');
        }
        break;
      case 'REMOVE_PHASE':
        if (!payload.phaseId) throw new BadRequestException('Thiếu phaseId');
        break;
      case 'ADD_STEP':
        if (!payload.phaseId || !String(payload.name ?? '').trim()) {
          throw new BadRequestException('Thiếu phaseId hoặc name');
        }
        break;
      case 'REMOVE_STEP':
        if (!payload.stepId) throw new BadRequestException('Thiếu stepId');
        break;
      case 'ADJUST_DURATION':
        if (!payload.phaseId || typeof payload.plannedDurationDays !== 'number') {
          throw new BadRequestException('Thiếu phaseId hoặc plannedDurationDays');
        }
        break;
      case 'REORDER_PHASES':
        if (!Array.isArray(payload.phaseIds) || payload.phaseIds.length === 0) {
          throw new BadRequestException('Thiếu phaseIds');
        }
        break;
      case 'IMPORT_SCHEDULE':
        if (!Array.isArray(payload.draftPhases) || payload.draftPhases.length === 0) {
          throw new BadRequestException('Bản nháp tiến độ rỗng');
        }
        break;
    }
  }

  /** Validate nhẹ theo trạng thái hiện tại lúc đề xuất — chỉ để báo lỗi sớm cho UX, `decide()` sẽ
   * re-validate đầy đủ (qua chính applyX) vì trạng thái có thể đổi giữa lúc đề xuất và lúc duyệt. */
  private async preValidate(
    projectId: string,
    type: PlanChangeType,
    payload: PlanChangePayload,
    byOwner: boolean,
  ) {
    switch (type) {
      case 'REMOVE_PHASE': {
        const phase = await this.prisma.phase.findUnique({ where: { id: payload.phaseId } });
        if (!phase) throw new NotFoundException('Không tìm thấy hạng mục');
        if (phase.status !== 'LOCKED') {
          throw new BadRequestException('Chỉ đề xuất xoá hạng mục chưa thi công');
        }
        break;
      }
      case 'REMOVE_STEP': {
        const step = await this.prisma.step.findUnique({ where: { id: payload.stepId } });
        if (!step) throw new NotFoundException('Không tìm thấy bước');
        if (step.mandatory && !byOwner) {
          throw new BadRequestException('Bước bắt buộc, chỉ chủ nhà mới xoá được');
        }
        if (step.status !== 'LOCKED') {
          throw new BadRequestException('Chỉ đề xuất xoá bước chưa thi công');
        }
        break;
      }
      case 'REORDER_PHASES': {
        const existing = await this.prisma.phase.findMany({ where: { projectId } });
        const phaseIds = payload.phaseIds as string[];
        if (
          phaseIds.length !== existing.length ||
          !existing.every((p) => phaseIds.includes(p.id))
        ) {
          throw new BadRequestException('Danh sách hạng mục không khớp với dự án');
        }
        break;
      }
      case 'IMPORT_SCHEDULE': {
        // Chỉ cho phép lúc PLANNING — thay toàn bộ cây hạng mục/bước giữa lúc đang thi công sẽ xoá
        // luôn tiến độ/bằng chứng đang dang dở, quá rủi ro. Khác các loại đề xuất khác (được phép
        // cả PLANNING lẫn ACTIVE), nên override lại status-check chung ở `request()`.
        const project = await this.prisma.project.findUnique({ where: { id: projectId } });
        if (project?.status !== 'PLANNING') {
          throw new BadRequestException(
            'Chỉ nhập tiến độ mới lúc đang lập kế hoạch, trước khi bắt đầu thi công',
          );
        }
        break;
      }
      default:
        break;
    }
  }

  private apply(projectId: string, type: PlanChangeType, payload: PlanChangePayload) {
    switch (type) {
      case 'ADD_PHASE':
        return this.projects.applyAddPhase(projectId, payload as { code?: string; name?: string });
      case 'REMOVE_PHASE':
        return this.projects.applyRemovePhase(payload.phaseId);
      case 'ADD_STEP':
        return this.projects.applyAddStep(payload.phaseId, payload as { name: string });
      case 'REMOVE_STEP':
        return this.projects.applyRemoveStep(payload.stepId);
      case 'ADJUST_DURATION':
        return this.projects.applyAdjustDuration(payload.phaseId, payload.plannedDurationDays);
      case 'REORDER_PHASES':
        return this.projects.applyReorderPhases(projectId, payload.phaseIds);
      case 'IMPORT_SCHEDULE':
        return this.projects.applyImportSchedule(projectId, payload.draftPhases);
    }
  }

  async request(
    projectId: string,
    actorId: string,
    dto: { type: PlanChangeType; payload: PlanChangePayload; note?: string },
  ) {
    const member = await this.projects.requireMember(projectId, actorId, [
      'MAIN_CONTRACTOR',
      'OWNER',
    ]);
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException();
    if (project.status !== 'PLANNING' && project.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Chỉ đề xuất sửa kế hoạch lúc đang lập kế hoạch hoặc đang thi công',
      );
    }
    this.validatePayloadShape(dto.type, dto.payload);

    let targetApproverRole: ProjectRole;
    if (member.role === 'MAIN_CONTRACTOR') {
      targetApproverRole = 'OWNER';
    } else {
      if (project.status === 'PLANNING') {
        throw new BadRequestException(
          'Đang lập kế hoạch, chủ nhà sửa trực tiếp trên màn Kế hoạch, không cần đề xuất',
        );
      }
      const mainContractor = await this.prisma.projectMember.findFirst({
        where: { projectId, role: 'MAIN_CONTRACTOR' },
      });
      if (!mainContractor) {
        throw new BadRequestException('Dự án chưa có thầu chính để duyệt đề xuất');
      }
      targetApproverRole = 'MAIN_CONTRACTOR';
    }

    await this.preValidate(projectId, dto.type, dto.payload, member.role === 'OWNER');
    const description = await this.describe(dto.type, dto.payload);

    const request = await this.prisma.planChangeRequest.create({
      data: {
        projectId,
        requestedById: actorId,
        targetApproverRole,
        type: dto.type,
        payload: dto.payload,
        note: dto.note,
      },
    });

    const actorLabel = member.role === 'MAIN_CONTRACTOR' ? 'Thầu chính' : 'Chủ nhà';
    await this.activity.log(
      projectId,
      'PLAN_CHANGE_REQUESTED',
      `${actorLabel} đề xuất ${description}`,
      { actorId },
    );
    await this.notifications.notifyProject(projectId, {
      title: 'Có đề xuất thay đổi kế hoạch',
      body: `${actorLabel} đề xuất ${description}, cần bạn duyệt.`,
      roles: [targetApproverRole],
      excludeUserId: actorId,
      type: 'PLAN_CHANGE_REQUESTED',
      data: { projectId, requestId: request.id },
    });
    return request;
  }

  async list(projectId: string, userId: string) {
    await this.projects.requireMember(projectId, userId);
    return this.prisma.planChangeRequest.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: {
        requestedBy: { select: { id: true, name: true } },
        decidedBy: { select: { id: true, name: true } },
      },
    });
  }

  async decide(
    requestId: string,
    actorId: string,
    dto: { decision: 'APPROVED' | 'REJECTED'; note?: string },
  ) {
    const request = await this.prisma.planChangeRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException();
    if (request.status !== 'PROPOSED') {
      throw new BadRequestException('Đề xuất này đã được xử lý rồi');
    }
    await this.projects.requireMember(request.projectId, actorId, [request.targetApproverRole]);

    const payload = request.payload as PlanChangePayload;
    const description = await this.describe(request.type, payload);
    const requesterLabel = request.targetApproverRole === 'OWNER' ? 'thầu chính' : 'chủ nhà';
    const deciderLabel = request.targetApproverRole === 'OWNER' ? 'Chủ nhà' : 'Thầu chính';

    if (dto.decision === 'REJECTED') {
      const updated = await this.prisma.planChangeRequest.update({
        where: { id: requestId },
        data: {
          status: 'REJECTED',
          decidedById: actorId,
          decidedAt: new Date(),
          decisionNote: dto.note,
        },
      });
      await this.activity.log(
        request.projectId,
        'PLAN_CHANGE_REJECTED',
        `${deciderLabel} từ chối đề xuất ${description} của ${requesterLabel}${dto.note ? `: ${dto.note}` : ''}`,
        { actorId },
      );
      await this.notifications.notifyUser(request.requestedById, {
        title: 'Đề xuất bị từ chối',
        body: `Đề xuất ${description} đã bị từ chối${dto.note ? `: ${dto.note}` : ''}.`,
        type: 'PLAN_CHANGE_REJECTED',
        data: { projectId: request.projectId, requestId },
      });
      return updated;
    }

    // Áp dụng thay đổi thật — nếu lỗi (VD trạng thái đã đổi từ lúc đề xuất), để lỗi propagate,
    // KHÔNG update status → request vẫn PROPOSED để chủ nhà/thầu chính thử lại hoặc từ chối.
    await this.apply(request.projectId, request.type, payload);

    const updated = await this.prisma.planChangeRequest.update({
      where: { id: requestId },
      data: {
        status: 'APPROVED',
        decidedById: actorId,
        decidedAt: new Date(),
        decisionNote: dto.note,
      },
    });
    await this.activity.log(
      request.projectId,
      'PLAN_CHANGE_APPROVED',
      `${deciderLabel} đã duyệt đề xuất ${description} của ${requesterLabel}`,
      { actorId },
    );
    await this.notifications.notifyUser(request.requestedById, {
      title: 'Đề xuất đã được duyệt',
      body: `Đề xuất ${description} đã được duyệt và áp dụng vào kế hoạch.`,
      type: 'PLAN_CHANGE_APPROVED',
      data: { projectId: request.projectId, requestId },
    });
    return updated;
  }
}
