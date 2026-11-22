import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DriveStorageService } from '../google-drive/drive-storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { phaseInScope } from '../projects/member-scope';

const CONTRACTOR_ROLES = ['MAIN_CONTRACTOR', 'SUB_CONTRACTOR'];

function toDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Nhật ký vật tư — khác hẳn MaterialCheckService (cổng duyệt vật tư TRƯỚC thi công, chốt 1 lần).
 * Đây là log liên tục: thầu báo cáo vật tư nhập vào công trình theo từng ngày, gắn bước thi công,
 * bắt buộc kèm ảnh hóa đơn, không cần ai duyệt. Đơn giá/tổng chi chỉ MAIN_CONTRACTOR thấy — kể cả
 * khi chính đội trưởng (SUB_CONTRACTOR) là người báo cáo, vì họ không phải người chi tiền.
 */
/** Cửa sổ sửa/xoá vật tư sau khi báo cáo. */
const EDIT_WINDOW_MS = 72 * 60 * 60 * 1000;

@Injectable()
export class MaterialLogService {
  constructor(
    private prisma: PrismaService,
    private driveStorage: DriveStorageService,
    private notifications: NotificationsService,
  ) {}

  private async requireMember(projectId: string, userId: string) {
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!member) throw new ForbiddenException('Bạn không thuộc dự án này');
    return member;
  }

  /** Thầu chính luôn thấy giá. Hợp đồng khoán nhân công (NHAN_CONG): chủ nhà tự mua vật tư nên
   * chủ nhà cũng thấy giá (review 10.6 #4). */
  private canSeePrice(role: string, contractType?: string): boolean {
    return role === 'MAIN_CONTRACTOR' || (role === 'OWNER' && contractType === 'NHAN_CONG');
  }

  /** Thầu nhập vật tư; chủ nhà cũng nhập được (khoán nhân công, hoặc góp vật tư dù trọn gói). */
  private canAdd(role: string): boolean {
    return CONTRACTOR_ROLES.includes(role) || role === 'OWNER';
  }

  // Ghi chú vật tư: chủ nhà/giám sát gửi, MAIN_CONTRACTOR nhận — đội trưởng (SUB_CONTRACTOR)
  // không tham gia thread này (khớp bảng phân quyền: "Ghi chú/comment — Đội trưởng ❌").
  private canSeeNotes(role: string): boolean {
    return role !== 'SUB_CONTRACTOR';
  }

  private toView(m: {
    id: string;
    reportDate: Date;
    name: string;
    quantity: { toString(): string };
    unit: string;
    unitPrice: { toString(): string } | null;
    note: string | null;
    reportedById: string;
    reportedBy: { id: string; name: string };
    createdAt: Date;
    steps: { id: string; order: number; name: string; phase: { code: string; name: string } }[];
    photos: { id: string; objectKey: string }[];
  }, viewerId: string, canSeePrice: boolean) {
    const quantity = Number(m.quantity);
    const unitPrice = m.unitPrice != null ? Number(m.unitPrice) : null;
    const withinEditWindow = Date.now() - m.createdAt.getTime() < EDIT_WINDOW_MS;
    return {
      id: m.id,
      reportDate: m.reportDate.toISOString(),
      name: m.name,
      quantity,
      unit: m.unit,
      unitPrice: canSeePrice ? unitPrice : null,
      total: canSeePrice && unitPrice != null ? quantity * unitPrice : null,
      note: m.note,
      reportedBy: m.reportedBy,
      createdAt: m.createdAt,
      steps: m.steps.map((s) => ({
        stepId: s.id,
        stepCode: s.phase.code,
        stepName: s.name,
        phaseName: s.phase.name,
      })),
      photos: m.photos.map((p) => ({ id: p.id, objectKey: p.objectKey })),
      canEdit: m.reportedById === viewerId && withinEditWindow,
    };
  }

  /** Nhật ký vật tư cho 1 ngày cụ thể — mặc định hôm nay. */
  async getDailyLog(projectId: string, userId: string, dateStr?: string) {
    const member = await this.requireMember(projectId, userId);
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { contractType: true } });
    const canSeePrice = this.canSeePrice(member.role, project?.contractType);
    const canSeeNotes = this.canSeeNotes(member.role);
    const day = toDateOnly(dateStr ? new Date(dateStr) : new Date());

    const materials = await this.prisma.materialLog.findMany({
      where: { projectId, reportDate: day },
      orderBy: { createdAt: 'desc' },
      include: {
        reportedBy: { select: { id: true, name: true } },
        steps: { include: { phase: { select: { code: true, name: true } } } },
        photos: true,
      },
    });

    const notes = canSeeNotes
      ? await this.prisma.materialDayNote.findMany({
          where: { projectId, date: day },
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, name: true } } },
        })
      : [];

    const items = materials.map((m) => this.toView(m, userId, canSeePrice));
    const dailyTotal = canSeePrice
      ? items.reduce((sum, m) => sum + (m.total ?? 0), 0)
      : null;
    const withInvoice = materials.filter((m) => m.photos.length > 0).length;
    const distinctSteps = new Set(materials.flatMap((m) => m.steps.map((s) => s.id))).size;

    return {
      date: day.toISOString(),
      canSeePrice,
      canAdd: this.canAdd(member.role),
      canSeeNotes,
      canSendNote: member.role === 'OWNER' || member.role === 'SUPERVISOR',
      items,
      dailyTotal,
      metrics: {
        materialCount: materials.length,
        withInvoiceCount: withInvoice,
        stepCount: distinctSteps,
      },
      notes: notes.map((n) => ({
        id: n.id,
        body: n.body,
        createdAt: n.createdAt,
        author: n.author,
      })),
    };
  }

  /** Thầu (chính/phụ, gồm đội trưởng) báo cáo 1 loại vật tư — thầu phụ chỉ gắn được bước thuộc
   * hạng mục mình được gán, khớp quyền các thao tác khác trên bước (WorkflowService.requireContractor). */
  async addMaterial(
    projectId: string,
    userId: string,
    dto: {
      name: string;
      quantity: number;
      unit: string;
      unitPrice?: number;
      note?: string;
      date?: string;
      stepIds: string[];
    },
    files: { originalname: string; mimetype: string; buffer: Buffer }[],
  ) {
    const member = await this.requireMember(projectId, userId);
    const proj = await this.prisma.project.findUnique({ where: { id: projectId }, select: { contractType: true } });
    if (!this.canAdd(member.role)) {
      throw new ForbiddenException('Chỉ thầu mới báo cáo vật tư');
    }
    if (!dto.name?.trim()) throw new BadRequestException('Cần tên vật tư');
    if (!dto.quantity || dto.quantity <= 0) throw new BadRequestException('Số lượng phải lớn hơn 0');
    if (!dto.stepIds?.length) throw new BadRequestException('Cần chọn ít nhất 1 bước thi công');
    if (!files?.length) throw new BadRequestException('Cần chụp ảnh hóa đơn/chứng từ');
    if (dto.note != null && dto.note.length > 500) {
      throw new BadRequestException('Ghi chú tối đa 500 ký tự');
    }

    const steps = await this.prisma.step.findMany({
      where: { id: { in: dto.stepIds }, phase: { projectId } },
      include: { phase: { select: { code: true, projectId: true } } },
    });
    if (steps.length !== dto.stepIds.length) {
      throw new BadRequestException('Có bước thi công không hợp lệ');
    }
    if (member.role === 'SUB_CONTRACTOR') {
      const outOfScope = steps.some((s) => !phaseInScope(member, s.phase.code));
      if (outOfScope) {
        throw new ForbiddenException('Thầu phụ chỉ gắn được bước thuộc hạng mục được gán');
      }
    }

    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException();
    if (!project.driveAccountId) {
      throw new BadRequestException(
        'Công trình chưa liên kết tài khoản Google Drive, chủ nhà cần chọn tài khoản lưu trữ trước',
      );
    }

    const reportDate = toDateOnly(dto.date ? new Date(dto.date) : new Date());
    // Chỉ MAIN_CONTRACTOR mới lưu đơn giá — đội trưởng (SUB_CONTRACTOR) báo cáo số lượng vật tư
    // dùng, không phải người trả tiền nên không có khái niệm "đơn giá của tôi" ở đây.
    const unitPrice = this.canSeePrice(member.role, proj?.contractType) ? dto.unitPrice : undefined;

    // Upload hết ảnh/hóa đơn lên Drive TRƯỚC khi ghi bất kỳ record nào — tránh để lại 1 dòng
    // "đã báo cáo vật tư" mồ côi không có ảnh chứng từ nếu Drive lỗi giữa chừng (hết quyền truy
    // cập, mất mạng...). Tên file + mô tả kèm tên vật tư/số lượng/bước — dò lại trong Drive dễ
    // hơn nhiều so với tên file ngẫu nhiên, đúng yêu cầu spec "Metadata trong file description".
    const safeName = dto.name.trim().replace(/[\\/:*?"<>|]/g, '');
    const stepLabel = steps.map((s) => s.phase.code).join(', ');
    const description = `Vật tư: ${dto.name.trim()} — SL: ${dto.quantity} ${dto.unit} — Bước: ${stepLabel}`;
    const uploadedFileIds: string[] = [];
    let i = 0;
    for (const file of files) {
      i += 1;
      const ext = file.mimetype.split('/')[1] ?? 'jpg';
      const uploaded = await this.driveStorage.uploadToProjectPhase(
        project.driveAccountId,
        project.name,
        'Vật tư',
        `${safeName}_${Date.now()}_${i}.${ext}`,
        file.mimetype,
        file.buffer,
        description,
      );
      uploadedFileIds.push(uploaded.fileId);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const log = await tx.materialLog.create({
        data: {
          projectId,
          reportedById: userId,
          reportDate,
          name: dto.name.trim(),
          quantity: dto.quantity,
          unit: dto.unit || 'Cái',
          unitPrice,
          note: dto.note?.trim() || undefined,
          steps: { connect: dto.stepIds.map((id) => ({ id })) },
        },
      });
      await tx.materialLogPhoto.createMany({
        data: uploadedFileIds.map((fileId) => ({ materialLogId: log.id, objectKey: fileId })),
      });
      return log;
    });

    // Thông báo vật tư mới (màn 10): thầu nhập → chủ nhà; chủ nhà tự nhập (khoán nhân công) → thầu chính.
    const notifyRole = member.role === 'OWNER' ? 'MAIN_CONTRACTOR' : 'OWNER';
    await this.notifications.notifyProject(projectId, {
      title: 'Vật tư mới nhập',
      body: `${dto.name.trim()} ${dto.quantity} ${dto.unit || 'Cái'} — ${stepLabel}`,
      excludeUserId: userId,
      roles: [notifyRole],
      type: 'MATERIAL_LOG_ADDED',
      data: { projectId },
    });

    return { ok: true, id: created.id };
  }

  /** Chỉ người báo cáo mới sửa/xoá được, trong 72 giờ kể từ lúc báo cáo (review 10.6 #12 — nhập
   * sai hôm trước vẫn sửa được); mỗi lần sửa lưu lịch sử (MaterialLogRevision). */
  private async requireOwnRecentEntry(materialId: string, userId: string) {
    const material = await this.prisma.materialLog.findUnique({ where: { id: materialId } });
    if (!material) throw new NotFoundException('Không tìm thấy vật tư');
    const withinWindow = Date.now() - material.createdAt.getTime() < EDIT_WINDOW_MS;
    if (material.reportedById !== userId || !withinWindow) {
      throw new ForbiddenException('Chỉ người báo cáo mới sửa/xoá được, và chỉ trong 72 giờ sau khi báo cáo');
    }
    return material;
  }

  async updateMaterial(
    materialId: string,
    userId: string,
    dto: { name?: string; quantity?: number; unit?: string; unitPrice?: number; note?: string },
  ) {
    const before = await this.requireOwnRecentEntry(materialId, userId);
    const [member, proj] = await Promise.all([
      this.prisma.projectMember.findUnique({ where: { projectId_userId: { projectId: before.projectId, userId } } }),
      this.prisma.project.findUnique({ where: { id: before.projectId }, select: { contractType: true } }),
    ]);
    const mayPrice = !!member && this.canSeePrice(member.role, proj?.contractType);
    if (dto.note != null && dto.note.length > 500) {
      throw new BadRequestException('Ghi chú tối đa 500 ký tự');
    }
    await this.prisma.materialLogRevision.create({
      data: {
        materialLogId: materialId,
        editedById: userId,
        before: { name: before.name, quantity: Number(before.quantity), unit: before.unit, unitPrice: before.unitPrice != null ? Number(before.unitPrice) : null, note: before.note },
      },
    });
    await this.prisma.materialLog.update({
      where: { id: materialId },
      data: {
        name: dto.name?.trim(),
        quantity: dto.quantity,
        unit: dto.unit,
        unitPrice: mayPrice ? dto.unitPrice : undefined,
        note: dto.note?.trim(),
      },
    });
    return { ok: true };
  }

  async deleteMaterial(materialId: string, userId: string) {
    await this.requireOwnRecentEntry(materialId, userId);
    await this.prisma.materialLog.delete({ where: { id: materialId } });
    return { ok: true };
  }

  /** Chủ nhà/giám sát gửi ghi chú cho thầu về vật tư trong ngày — thầu chỉ đọc, không trả lời tại
   * đây (khác hẳn comment 2 chiều ở bước thi công, cố tình đơn giản vì đây chỉ là dặn dò/nhắc nhở). */
  async addDayNote(projectId: string, userId: string, dto: { date?: string; body: string }) {
    const member = await this.requireMember(projectId, userId);
    if (member.role !== 'OWNER' && member.role !== 'SUPERVISOR') {
      throw new ForbiddenException('Chỉ chủ nhà/giám sát mới gửi ghi chú vật tư');
    }
    if (!dto.body?.trim()) throw new BadRequestException('Cần nội dung ghi chú');
    const date = toDateOnly(dto.date ? new Date(dto.date) : new Date());

    const note = await this.prisma.materialDayNote.create({
      data: { projectId, date, authorId: userId, body: dto.body.trim() },
      include: { author: { select: { id: true, name: true } } },
    });

    const mainContractor = await this.prisma.projectMember.findFirst({
      where: { projectId, role: 'MAIN_CONTRACTOR' },
    });
    if (mainContractor) {
      await this.notifications.notifyUser(mainContractor.userId, {
        title: 'Ghi chú vật tư mới',
        body: dto.body.trim().slice(0, 120),
        type: 'MATERIAL_LOG_NOTE',
        data: { projectId },
      });
    }

    return note;
  }
}
