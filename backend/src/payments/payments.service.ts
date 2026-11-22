import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';

/**
 * Gating ứng tiền — app KHÔNG giữ tiền, chỉ tính trạng thái đủ điều kiện.
 * Đợt N ELIGIBLE ⇔:
 *  1. Phase mốc (unlockAfterPhase) đã DONE
 *  2. Không còn defect OPEN thuộc các phase từ đầu đến phase mốc
 *  3. Mọi đợt trước đã CONFIRMED_PAID
 */
@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private projects: ProjectsService,
    private activity: ActivityService,
    private notifications: NotificationsService,
  ) {}

  // Ứng tiền là thoả thuận tài chính giữa chủ nhà và thầu chính — thầu phụ/giám sát không liên
  // quan nên không cho xem (khác các module khác vốn mở cho mọi thành viên xem).
  async list(projectId: string, userId: string) {
    await this.projects.requireMember(projectId, userId, ['OWNER', 'MAIN_CONTRACTOR']);
    await this.recompute(projectId);
    return this.prisma.paymentStage.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
      include: { unlockAfterPhase: { select: { code: true, name: true, status: true } } },
    });
  }

  async createStage(
    projectId: string,
    actorId: string,
    dto: { name: string; amount: number; unlockAfterPhaseId: string },
  ) {
    await this.projects.requireMember(projectId, actorId, ['OWNER', 'MAIN_CONTRACTOR']);
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (project?.status !== 'PLANNING') {
      throw new BadRequestException('Chỉ thiết lập đợt ứng tiền khi đang lập kế hoạch');
    }
    const count = await this.prisma.paymentStage.count({ where: { projectId } });
    return this.prisma.paymentStage.create({
      data: {
        projectId,
        order: count + 1,
        name: dto.name,
        amount: dto.amount,
        unlockAfterPhaseId: dto.unlockAfterPhaseId,
      },
    });
  }

  /** Chủ nhà xác nhận đã chuyển tiền NGOÀI app. */
  async confirmPaid(stageId: string, actorId: string) {
    const stage = await this.prisma.paymentStage.findUnique({ where: { id: stageId } });
    if (!stage) throw new NotFoundException();
    await this.projects.requireMember(stage.projectId, actorId, ['OWNER']);
    await this.recompute(stage.projectId);

    const fresh = await this.prisma.paymentStage.findUnique({ where: { id: stageId } });
    if (fresh?.status !== 'ELIGIBLE') {
      throw new BadRequestException(
        'Đợt này chưa đủ điều kiện ứng: giai đoạn trước chưa xong hoặc còn lỗi (defect) chưa sửa',
      );
    }
    const updated = await this.prisma.paymentStage.update({
      where: { id: stageId },
      data: { status: 'CONFIRMED_PAID', paidAt: new Date() },
    });
    await this.activity.log(
      stage.projectId,
      'PAYMENT_STAGE_CONFIRMED',
      `Chủ nhà xác nhận đã ứng tiền đợt "${stage.name}"`,
      { actorId },
    );
    await this.notifications.notifyProject(stage.projectId, {
      title: 'Đã xác nhận ứng tiền',
      body: `Chủ nhà xác nhận đã chuyển đợt "${stage.name}".`,
      excludeUserId: actorId,
      type: 'PAYMENT_CONFIRMED',
      data: { projectId: stage.projectId },
    });
    return updated;
  }

  /** Tính lại trạng thái mọi đợt của dự án. Gọi sau mỗi lần duyệt bước / đóng defect. */
  async recompute(projectId: string) {
    const stages = await this.prisma.paymentStage.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
      include: { unlockAfterPhase: true },
    });
    if (stages.length === 0) return;

    const phases = await this.prisma.phase.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
      select: { id: true, order: true, status: true },
    });
    const openDefects = await this.prisma.defect.findMany({
      where: { projectId, status: { not: 'CLOSED' } },
      include: { step: { select: { phase: { select: { order: true } } } } },
    });

    let previousPaid = true;
    for (const stage of stages) {
      if (stage.status === 'CONFIRMED_PAID') {
        previousPaid = true;
        continue;
      }
      const milestone = phases.find((p) => p.id === stage.unlockAfterPhaseId);
      const phaseDone = milestone?.status === 'DONE';
      const hasBlockingDefect = openDefects.some((d) => {
        const defectPhaseOrder = d.step?.phase.order ?? 0;
        return milestone ? defectPhaseOrder <= milestone.order : true;
      });
      const eligible = phaseDone && !hasBlockingDefect && previousPaid;
      const newStatus = eligible ? 'ELIGIBLE' : 'LOCKED';
      if (stage.status !== newStatus) {
        await this.prisma.paymentStage.update({
          where: { id: stage.id },
          data: { status: newStatus },
        });
        // Chỉ báo lúc CHUYỂN sang ELIGIBLE (nhờ guard status!==newStatus ở trên nên không lặp lại
        // mỗi lần recompute được gọi, VD mỗi lần GET /payments). Giới hạn OWNER/MAIN_CONTRACTOR vì
        // Ứng tiền vốn ẩn với thầu phụ/giám sát (PaymentsService.list).
        if (newStatus === 'ELIGIBLE') {
          await this.notifications.notifyProject(projectId, {
            title: 'Đủ điều kiện ứng tiền',
            body: `Đợt "${stage.name}" đã đủ điều kiện ứng tiền.`,
            roles: ['OWNER', 'MAIN_CONTRACTOR'],
            type: 'PAYMENT_ELIGIBLE',
            data: { projectId },
          });
        }
      }
      previousPaid = false; // đợt sau chỉ mở khi đợt này đã CONFIRMED_PAID
    }
  }

  /** Tổng quan tiền (review 10.6 #5): dự toán (tổng các đợt), đã trả, phát sinh đã duyệt, còn lại. */
  async summary(projectId: string, userId: string) {
    await this.projects.requireMember(projectId, userId, ['OWNER', 'MAIN_CONTRACTOR']);
    const [stages, extras] = await Promise.all([
      this.prisma.paymentStage.findMany({ where: { projectId } }),
      this.prisma.extraCost.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' } }),
    ]);
    const contract = stages.reduce((s, x) => s + Number(x.amount), 0);
    const paid = stages.filter((x) => x.status === 'CONFIRMED_PAID').reduce((s, x) => s + Number(x.amount), 0);
    const extra = extras.filter((x) => x.status === 'APPROVED').reduce((s, x) => s + Number(x.amount), 0);
    return {
      contract,
      paid,
      extra,
      total: contract + extra,
      remaining: contract + extra - paid,
      extras: extras.map((x) => ({ ...x, amount: Number(x.amount), mine: x.createdById === userId })),
    };
  }

  /** Đề xuất chi phí phát sinh — chủ nhà hoặc thầu chính; bên kia duyệt. */
  async proposeExtra(projectId: string, userId: string, dto: { title: string; amount: number; note?: string; phaseCode?: string }) {
    const member = await this.projects.requireMember(projectId, userId, ['OWNER', 'MAIN_CONTRACTOR']);
    if (!dto.title?.trim() || !(dto.amount > 0)) throw new BadRequestException('Cần nội dung và số tiền phát sinh');
    const extra = await this.prisma.extraCost.create({
      data: { projectId, title: dto.title.trim(), amount: dto.amount, note: dto.note?.trim() || null, phaseCode: dto.phaseCode, createdById: userId },
    });
    await this.notifications.notifyProject(projectId, {
      title: 'Đề xuất chi phí phát sinh',
      body: `${dto.title.trim()}: ${dto.amount.toLocaleString('vi-VN')}đ — cần duyệt`,
      excludeUserId: userId,
      roles: [member.role === 'OWNER' ? 'MAIN_CONTRACTOR' : 'OWNER'],
      type: 'EXTRA_COST_PROPOSED',
      data: { projectId },
    });
    return extra;
  }

  async decideExtra(extraId: string, userId: string, approve: boolean) {
    const extra = await this.prisma.extraCost.findUnique({ where: { id: extraId } });
    if (!extra) throw new NotFoundException();
    await this.projects.requireMember(extra.projectId, userId, ['OWNER', 'MAIN_CONTRACTOR']);
    if (extra.createdById === userId) throw new BadRequestException('Bên còn lại mới duyệt được phát sinh này');
    if (extra.status !== 'PENDING') throw new BadRequestException('Phát sinh đã được xử lý');
    const updated = await this.prisma.extraCost.update({
      where: { id: extraId },
      data: { status: approve ? 'APPROVED' : 'REJECTED', decidedAt: new Date() },
    });
    await this.notifications.notifyUser(extra.createdById, {
      title: approve ? 'Phát sinh đã được duyệt' : 'Phát sinh bị từ chối',
      body: `${extra.title}: ${Number(extra.amount).toLocaleString('vi-VN')}đ`,
      type: 'EXTRA_COST_DECIDED',
      data: { projectId: extra.projectId },
    });
    return updated;
  }
}
