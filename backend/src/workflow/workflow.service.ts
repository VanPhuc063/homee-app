import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DefectStatus, EvidenceType } from '@prisma/client';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { DriveStorageService } from '../google-drive/drive-storage.service';
import { phaseInScope } from '../projects/member-scope';

/**
 * Workflow Engine — trái tim của app.
 * Bất biến:
 *  - Bước chỉ OPEN khi mọi bước trước đó trong phase đã APPROVED.
 *  - Phase chỉ mở khi phase trước DONE.
 *  - Nộp bước cần đủ minPhotos (+ video nếu yêu cầu).
 *  - Duyệt 2 lớp: SUPERVISOR trước, OWNER sau.
 *  - Evidence (ảnh/video) thêm được ở bất kỳ trạng thái bước nào, bởi thầu chính/phụ, giám sát hoặc
 *    chủ nhà (VD: giám sát/chủ nhà chụp khảo sát thực trạng) — mỗi evidence lưu uploaderId để truy vết.
 */
@Injectable()
export class WorkflowService {
  constructor(
    private prisma: PrismaService,
    private projects: ProjectsService,
    private payments: PaymentsService,
    private activity: ActivityService,
    private notifications: NotificationsService,
    private driveStorage: DriveStorageService,
  ) {}

  private async getStepOrThrow(stepId: string) {
    const step = await this.prisma.step.findUnique({
      where: { id: stepId },
      include: { phase: { include: { project: true } }, evidences: true },
    });
    if (!step) throw new NotFoundException('Không tìm thấy bước');
    return step;
  }

  /** Thầu (chính hoặc phụ được gán phase) mới được submit — nộp bước là hành động "tôi đã làm xong". */
  private async requireContractor(step: Awaited<ReturnType<typeof this.getStepOrThrow>>, userId: string) {
    const member = await this.projects.requireMember(step.phase.projectId, userId, [
      'MAIN_CONTRACTOR',
      'SUB_CONTRACTOR',
    ]);
    if (
      !phaseInScope(member, step.phase.code)
    ) {
      throw new ForbiddenException('Thầu phụ chỉ thao tác trên hạng mục được gán');
    }
    return member;
  }

  /** Giám sát mời theo hạng mục/bước cụ thể (task-based) chỉ thao tác trong phạm vi được gán —
   * giám sát mời KHÔNG kèm phạm vi (assignedPhaseCodes/assignedStepIds rỗng) là giám sát toàn thời
   * gian/bán thời gian, không bị chặn (khớp ProjectsService.getPhases). */
  private assertSupervisorScope(
    member: { role: string; assignedPhaseCodes: string[]; assignedStepIds: string[] },
    step: Awaited<ReturnType<typeof this.getStepOrThrow>>,
  ) {
    if (member.role !== 'SUPERVISOR') return;
    const hasScope = member.assignedPhaseCodes.length > 0 || member.assignedStepIds.length > 0;
    if (!hasScope) return;
    const inScope =
      member.assignedPhaseCodes.includes(step.phase.code) || member.assignedStepIds.includes(step.id);
    if (!inScope) {
      throw new ForbiddenException('Giám sát chỉ thao tác trên bước được gán');
    }
  }

  /**
   * Bước có giám sát phụ trách không — giám sát toàn dự án, hoặc giám sát được gán đúng hạng mục/bước.
   * Không có thì chủ nhà tự đánh giá Đạt/Không đạt (đa số nhà phố không thuê giám sát riêng).
   */
  async stepHasSupervisor(step: { id: string; phase: { projectId: string; code: string } }) {
    const supervisors = await this.prisma.projectMember.findMany({
      where: { projectId: step.phase.projectId, role: 'SUPERVISOR' },
      select: { assignedPhaseCodes: true, assignedStepIds: true },
    });
    return supervisors.some(
      (m) =>
        (m.assignedPhaseCodes.length === 0 && m.assignedStepIds.length === 0) ||
        m.assignedPhaseCodes.includes(step.phase.code) ||
        m.assignedStepIds.includes(step.id),
    );
  }

  /** Upload ảnh/video thì rộng hơn submit: thầu thi công, và cả giám sát/chủ nhà khi họ tự đi khảo sát
   * thực trạng công trình (không cần đúng hạng mục được gán như thầu phụ). */
  private async requireUploader(step: Awaited<ReturnType<typeof this.getStepOrThrow>>, userId: string) {
    const member = await this.projects.requireMember(step.phase.projectId, userId, [
      'MAIN_CONTRACTOR',
      'SUB_CONTRACTOR',
      'SUPERVISOR',
      'OWNER',
    ]);
    if (
      !phaseInScope(member, step.phase.code)
    ) {
      throw new ForbiddenException('Thầu phụ chỉ thao tác trên hạng mục được gán');
    }
    this.assertSupervisorScope(member, step);
    return member;
  }

  /** Upload ảnh/video bằng chứng — lưu vào Drive của chủ nhà, dưới Homee/<công trình>/<hạng mục>. */
  async uploadEvidence(
    stepId: string,
    userId: string,
    file: { originalname: string; mimetype: string; buffer: Buffer } | undefined,
    dto: { type: EvidenceType; takenAt?: string },
  ) {
    const step = await this.getStepOrThrow(stepId);
    await this.requireUploader(step, userId);
    if (!file) throw new BadRequestException('Thiếu file ảnh/video');
    const project = step.phase.project;
    if (!project.driveAccountId) {
      throw new BadRequestException(
        'Công trình chưa liên kết tài khoản Google Drive, chủ nhà cần chọn tài khoản lưu trữ trước',
      );
    }
    const uploaded = await this.driveStorage.uploadToProjectPhase(
      project.driveAccountId,
      project.name,
      step.phase.name,
      file.originalname || `evidence-${Date.now()}`,
      file.mimetype,
      file.buffer,
    );
    const evidence = await this.prisma.evidence.create({
      data: {
        stepId,
        uploaderId: userId,
        type: dto.type,
        objectKey: uploaded.fileId,
        takenAt: dto.takenAt ? new Date(dto.takenAt) : new Date(),
      },
    });
    if (step.status === 'REJECTED') {
      await this.prisma.step.update({ where: { id: stepId }, data: { status: 'OPEN' } });
    }
    return evidence;
  }

  async submitStep(stepId: string, userId: string) {
    const step = await this.getStepOrThrow(stepId);
    await this.requireContractor(step, userId);
    if (!['OPEN', 'REJECTED'].includes(step.status)) {
      throw new BadRequestException('Bước không ở trạng thái có thể nộp');
    }

    const photos = step.evidences.filter((e) => e.type === 'PHOTO').length;
    const videos = step.evidences.filter((e) => e.type === 'VIDEO').length;
    if (photos < step.minPhotos) {
      throw new BadRequestException(
        `Cần tối thiểu ${step.minPhotos} ảnh (hiện có ${photos}). Quy trình chuẩn không cho bỏ qua.`,
      );
    }
    if (step.requiresVideo && videos < 1) {
      throw new BadRequestException('Bước này bắt buộc có video thi công');
    }

    const updated = await this.prisma.step.update({
      where: { id: stepId },
      data: { status: 'SUBMITTED' },
    });
    await this.activity.log(
      step.phase.projectId,
      'STEP_SUBMITTED',
      `Thầu đã nộp bước "${step.name}" để duyệt`,
      { actorId: userId, stepId },
    );
    await this.notifications.notifyProject(step.phase.projectId, {
      title: 'Có bước chờ duyệt',
      body: `Bước "${step.name}" vừa được nộp, cần kiểm tra và duyệt.`,
      excludeUserId: userId,
      type: 'STEP_SUBMITTED',
      data: { stepId },
    });
    return updated;
  }

  async approveStep(
    stepId: string,
    userId: string,
    file: { originalname: string; mimetype: string; buffer: Buffer } | undefined,
    dto: { decision: 'APPROVED' | 'REJECTED'; note?: string },
  ) {
    const step = await this.getStepOrThrow(stepId);
    const member = await this.projects.requireMember(step.phase.projectId, userId, [
      'SUPERVISOR',
      'OWNER',
    ]);
    this.assertSupervisorScope(member, step);

    // Duyệt 2 lớp: giám sát duyệt SUBMITTED, chủ nhà duyệt SUPERVISOR_APPROVED. Bước không có giám
    // sát phụ trách thì chủ nhà đánh giá thẳng bước SUBMITTED (1 lớp).
    if (member.role === 'SUPERVISOR' && step.status !== 'SUBMITTED') {
      throw new BadRequestException('Giám sát chỉ duyệt bước đã được thầu nộp');
    }
    if (member.role === 'OWNER') {
      const ownerCanReview =
        step.status === 'SUPERVISOR_APPROVED' ||
        (step.status === 'SUBMITTED' && !(await this.stepHasSupervisor(step)));
      if (!ownerCanReview) {
        throw new BadRequestException('Chủ nhà duyệt sau khi giám sát đã duyệt');
      }
    }

    // "Book giám sát": mọi giám sát phải có đúng thiết bị, chụp hình cho chủ đầu tư mỗi lần
    // nghiệm thu — bắt buộc kèm ảnh thiết bị khi giám sát duyệt/từ chối, chủ nhà thì không cần.
    let equipmentPhotoKey: string | undefined;
    if (member.role === 'SUPERVISOR') {
      if (!file) {
        throw new BadRequestException('Cần chụp ảnh thiết bị đo dùng để nghiệm thu trước khi duyệt/từ chối');
      }
      const project = step.phase.project;
      if (!project.driveAccountId) {
        throw new BadRequestException(
          'Công trình chưa liên kết tài khoản Google Drive, chủ nhà cần chọn tài khoản lưu trữ trước',
        );
      }
      const uploaded = await this.driveStorage.uploadToProjectPhase(
        project.driveAccountId,
        project.name,
        'Book giám sát',
        file.originalname || `equipment-${Date.now()}.jpg`,
        file.mimetype,
        file.buffer,
      );
      equipmentPhotoKey = uploaded.fileId;
    }

    await this.prisma.approval.create({
      data: {
        stepId,
        approverId: userId,
        level: member.role === 'SUPERVISOR' ? 'SUPERVISOR' : 'OWNER',
        decision: dto.decision,
        note: dto.note,
        equipmentPhotoKey,
      },
    });

    if (dto.decision === 'REJECTED') {
      const rejected = await this.prisma.step.update({
        where: { id: stepId },
        data: { status: 'REJECTED' },
      });
      await this.activity.log(
        step.phase.projectId,
        'STEP_REJECTED',
        `${member.role === 'SUPERVISOR' ? 'Giám sát' : 'Chủ nhà'} từ chối bước "${step.name}"${dto.note ? `: ${dto.note}` : ''}`,
        { actorId: userId, stepId },
      );
      await this.notifications.notifyProject(step.phase.projectId, {
        title: 'Bước bị từ chối',
        body: `Bước "${step.name}" bị từ chối${dto.note ? `: ${dto.note}` : ''}, cần làm lại.`,
        excludeUserId: userId,
        type: 'STEP_REJECTED',
        data: { stepId },
      });
      return rejected;
    }

    if (member.role === 'SUPERVISOR') {
      return this.prisma.step.update({
        where: { id: stepId },
        data: { status: 'SUPERVISOR_APPROVED' },
      });
    }

    // OWNER approve → bước DONE, mở khóa bước/phase tiếp theo, tính lại gating ứng tiền
    const approved = await this.prisma.step.update({
      where: { id: stepId },
      data: { status: 'APPROVED' },
    });
    await this.unlockNext(step.phaseId, step.phase.projectId);
    await this.payments.recompute(step.phase.projectId);
    await this.activity.log(
      step.phase.projectId,
      'STEP_APPROVED',
      `Chủ nhà đã duyệt xong bước "${step.name}"`,
      { actorId: userId, stepId },
    );
    await this.notifications.notifyProject(step.phase.projectId, {
      title: 'Bước đã duyệt xong',
      body: `Bước "${step.name}" đã hoàn thành. Có thể đã mở bước tiếp theo.`,
      excludeUserId: userId,
      type: 'STEP_APPROVED',
      data: { stepId },
    });
    return approved;
  }

  /** Mở bước kế tiếp trong phase; nếu hết bước → phase DONE, mở phase sau. */
  private async unlockNext(phaseId: string, projectId: string) {
    const steps = await this.prisma.step.findMany({
      where: { phaseId },
      orderBy: { order: 'asc' },
    });
    const next = steps.find((s) => s.status === 'LOCKED');
    if (next) {
      const allBeforeApproved = steps
        .filter((s) => s.order < next.order)
        .every((s) => s.status === 'APPROVED');
      if (allBeforeApproved) {
        await this.prisma.step.update({ where: { id: next.id }, data: { status: 'OPEN' } });
      }
      return;
    }
    if (steps.every((s) => s.status === 'APPROVED')) {
      await this.prisma.phase.update({ where: { id: phaseId }, data: { status: 'DONE' } });
      const phases = await this.prisma.phase.findMany({
        where: { projectId },
        orderBy: { order: 'asc' },
        include: { steps: { orderBy: { order: 'asc' } } },
      });
      const nextPhase = phases.find((p) => p.status === 'LOCKED');
      if (nextPhase) {
        await this.prisma.phase.update({
          where: { id: nextPhase.id },
          data: { status: 'IN_PROGRESS' },
        });
        const firstStep = nextPhase.steps[0];
        if (firstStep) {
          await this.prisma.step.update({ where: { id: firstStep.id }, data: { status: 'OPEN' } });
        }
      } else if (phases.every((p) => p.status === 'DONE')) {
        await this.prisma.project.update({
          where: { id: projectId },
          data: { status: 'HANDOVER' },
        });
      }
    }
  }

  async addComment(
    stepId: string,
    userId: string,
    dto: { body: string; evidenceId?: string },
  ) {
    const step = await this.getStepOrThrow(stepId);
    await this.projects.requireMember(step.phase.projectId, userId);
    const comment = await this.prisma.comment.create({
      data: { stepId, authorId: userId, body: dto.body, evidenceId: dto.evidenceId },
      include: { author: { select: { id: true, name: true } } },
    });
    await this.notifications.notifyMentions(step.phase.projectId, userId, dto.body, {
      title: `${comment.author.name} đã tag bạn`,
      body: `Bước "${step.name}": ${dto.body.slice(0, 120)}`,
      type: 'MENTION',
      data: { stepId },
    });
    return comment;
  }

  async getStepDetail(stepId: string, userId: string) {
    const step = await this.prisma.step.findUnique({
      where: { id: stepId },
      include: {
        phase: { select: { projectId: true, code: true, name: true } },
        evidences: {
          orderBy: { createdAt: 'asc' },
          include: {
            uploader: { select: { id: true, name: true } },
            comments: { include: { author: { select: { id: true, name: true } } } },
          },
        },
        approvals: {
          orderBy: { createdAt: 'asc' },
          include: { approver: { select: { id: true, name: true } } },
        },
        comments: {
          where: { evidenceId: null },
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, name: true } } },
        },
      },
    });
    if (!step) throw new NotFoundException();
    await this.projects.requireMember(step.phase.projectId, userId);

    // Gắn vai trò (trong dự án này) của tác giả từng comment — để mobile hiện badge màu theo vai
    // trò (Giám sát/Nhà thầu/Chủ nhà) như mockup, không lưu role trực tiếp trên Comment vì vai trò
    // của 1 user có thể khác nhau giữa các dự án (ProjectMember.role, không phải User.role).
    const authorIds = new Set<string>();
    for (const c of step.comments) authorIds.add(c.authorId);
    for (const e of step.evidences) for (const c of e.comments) authorIds.add(c.authorId);
    const members = await this.prisma.projectMember.findMany({
      where: { projectId: step.phase.projectId, userId: { in: [...authorIds] } },
      select: { userId: true, role: true },
    });
    const roleByUserId = new Map(members.map((m) => [m.userId, m.role]));
    const withRole = <T extends { authorId: string; author: object }>(c: T) => ({
      ...c,
      author: { ...c.author, role: roleByUserId.get(c.authorId) ?? null },
    });
    return {
      ...step,
      hasSupervisor: await this.stepHasSupervisor(step),
      comments: step.comments.map(withRole),
      evidences: step.evidences.map((e) => ({ ...e, comments: e.comments.map(withRole) })),
    };
  }

  // ---- Defects ----

  async createDefect(
    projectId: string,
    userId: string,
    dto: { title: string; stepId?: string },
  ) {
    await this.projects.requireMember(projectId, userId, ['OWNER', 'SUPERVISOR']);
    const defect = await this.prisma.defect.create({
      data: { projectId, raisedById: userId, title: dto.title, stepId: dto.stepId },
    });
    await this.payments.recompute(projectId);
    await this.activity.log(projectId, 'DEFECT_CREATED', `Lỗi mới: "${dto.title}"`, {
      actorId: userId,
      stepId: dto.stepId,
    });
    await this.notifications.notifyProject(projectId, {
      title: 'Có lỗi mới',
      body: dto.title,
      excludeUserId: userId,
      type: 'DEFECT_CREATED',
      data: { projectId },
    });
    return defect;
  }

  async updateDefect(defectId: string, userId: string, status: DefectStatus) {
    const defect = await this.prisma.defect.findUnique({ where: { id: defectId } });
    if (!defect) throw new NotFoundException();
    if (status === 'FIXED') {
      await this.projects.requireMember(defect.projectId, userId, [
        'MAIN_CONTRACTOR',
        'SUB_CONTRACTOR',
      ]);
    } else {
      // CLOSED / mở lại: chỉ chủ nhà hoặc giám sát
      await this.projects.requireMember(defect.projectId, userId, ['OWNER', 'SUPERVISOR']);
    }
    const updated = await this.prisma.defect.update({
      where: { id: defectId },
      data: { status },
    });
    await this.payments.recompute(defect.projectId);
    await this.activity.log(defect.projectId, 'DEFECT_UPDATED', `Lỗi "${defect.title}" → ${status}`, {
      actorId: userId,
      stepId: defect.stepId ?? undefined,
    });
    const statusLabel: Record<DefectStatus, string> = {
      OPEN: 'mở lại',
      FIXED: 'đã sửa, chờ xác nhận',
      CLOSED: 'đã đóng',
    };
    await this.notifications.notifyProject(defect.projectId, {
      title: status === 'CLOSED' ? 'Lỗi đã đóng' : status === 'FIXED' ? 'Lỗi đã được sửa' : 'Lỗi mở lại',
      body: `Lỗi "${defect.title}" ${statusLabel[status]}.`,
      excludeUserId: userId,
      type: 'DEFECT_UPDATED',
      data: { projectId: defect.projectId },
    });
    return updated;
  }

  listDefects(projectId: string, userId: string) {
    return this.projects.requireMember(projectId, userId).then(() =>
      this.prisma.defect.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
        include: {
          raisedBy: { select: { id: true, name: true } },
          step: { select: { id: true, name: true } },
        },
      }),
    );
  }
}
