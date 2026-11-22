import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MaterialCategory, ProjectRole } from '@prisma/client';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { DriveStorageService } from '../google-drive/drive-storage.service';

/**
 * Cổng duyệt vật tư trước thi công. Cấu trúc 3 lớp: MaterialCheck (1/dự án) → MaterialCheckItem
 * (1 loại vật tư, VD "Xi măng Hà Tiên", có hạng mục/bước dùng tới + giá) → MaterialDeliveryBatch
 * (1 đợt tập kết — 1 loại có thể tập kết NHIỀU lần nếu bị từ chối rồi bổ sung, mỗi đợt giữ ảnh +
 * quyết định + bình luận riêng, không mất lịch sử các lần nộp trước như model cũ). Chỉ chặn duyệt
 * kế hoạch khi contractType khác NHAN_CONG — xem `ProjectsService.approvePlan`.
 *
 * 2 chiều nộp: mặc định MAIN_CONTRACTOR khai vật tư tập kết, OWNER duyệt (luồng gốc). Nhưng OWNER
 * cũng có thể tự khai vật tư mình đã có sẵn (VD mua trước 100 thùng gạch) — khi đó đảo vai,
 * MAIN_CONTRACTOR là bên duyệt/tiếp nhận số lượng. `MaterialCheckItem.submittedByRole` đánh dấu
 * bên nào khai; mọi thao tác sửa/xoá/nộp item chỉ bên đó làm được, còn duyệt luôn là BÊN CÒN LẠI —
 * xem `deciderRoleFor`.
 */
@Injectable()
export class MaterialCheckService {
  constructor(
    private prisma: PrismaService,
    private projects: ProjectsService,
    private driveStorage: DriveStorageService,
    private activity: ActivityService,
    private notifications: NotificationsService,
  ) {}

  private materialCheckInclude() {
    return {
      items: {
        orderBy: { createdAt: 'asc' as const },
        include: {
          steps: {
            select: { id: true, order: true, name: true, phase: { select: { code: true, name: true } } },
          },
          batches: {
            orderBy: { batchNumber: 'asc' as const },
            include: {
              photos: {
                orderBy: { createdAt: 'asc' as const },
                include: { uploader: { select: { id: true, name: true } } },
              },
              comments: {
                orderBy: { createdAt: 'asc' as const },
                include: { author: { select: { id: true, name: true } } },
              },
            },
          },
        },
      },
    };
  }

  /** Bên duyệt LUÔN là phía đối diện với bên đã khai báo item — xem doc comment class. */
  private deciderRoleFor(submittedByRole: ProjectRole): ProjectRole {
    return submittedByRole === 'OWNER' ? 'MAIN_CONTRACTOR' : 'OWNER';
  }

  private roleLabel(role: ProjectRole) {
    return role === 'OWNER' ? 'chủ nhà' : 'thầu chính';
  }

  /** Vài dự án tạo trước khi có tính năng này chưa có row MaterialCheck — tạo lazy nếu thiếu. */
  async getOrCreate(projectId: string, userId: string) {
    await this.projects.requireMember(projectId, userId);
    const existing = await this.prisma.materialCheck.findUnique({
      where: { projectId },
      include: this.materialCheckInclude(),
    });
    if (existing) return existing;
    await this.prisma.materialCheck.create({ data: { projectId } });
    return this.prisma.materialCheck.findUniqueOrThrow({
      where: { projectId },
      include: this.materialCheckInclude(),
    });
  }

  async addPhoto(
    projectId: string,
    actorId: string,
    file: { originalname: string; mimetype: string; buffer: Buffer } | undefined,
    dto: {
      label: string;
      category?: MaterialCategory;
      quantityLabel?: string;
      unitPrice?: number;
      contractValue?: number;
      stepIds?: string[];
      supplierName?: string;
    },
  ) {
    const member = await this.projects.requireMember(projectId, actorId, ['MAIN_CONTRACTOR', 'OWNER']);
    const check = await this.getOrCreate(projectId, actorId);
    if (check.status === 'APPROVED') {
      throw new BadRequestException('Vật tư đã được duyệt, không thêm ảnh được nữa');
    }
    if (!file) throw new BadRequestException('Thiếu file ảnh');
    if (!dto.label?.trim()) throw new BadRequestException('Cần đặt tên loại vật tư (VD: Xi măng Hà Tiên)');
    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    if (!project.driveAccountId) {
      throw new BadRequestException(
        'Công trình chưa liên kết tài khoản Google Drive, chủ nhà cần chọn tài khoản lưu trữ trước',
      );
    }

    const existingItem = await this.prisma.materialCheckItem.findUnique({
      where: { materialCheckId_label: { materialCheckId: check.id, label: dto.label.trim() } },
      include: { batches: { orderBy: { batchNumber: 'desc' }, take: 1 } },
    });
    if (existingItem && existingItem.submittedByRole !== member.role) {
      // Item do bên kia khai báo (VD chủ nhà khai "Gạch", giờ thầu đụng đúng tên này) — chặn để
      // không lẫn quyền nộp/duyệt của 2 bên trên cùng 1 item, xem doc comment class.
      throw new ForbiddenException(
        `Loại vật tư "${existingItem.label}" do ${this.roleLabel(existingItem.submittedByRole)} khai báo, không thể bổ sung ảnh từ phía bên kia`,
      );
    }

    // Upload lên Drive TRƯỚC, chưa ghi gì vào DB — tránh để lại record "đã khai báo" mồ côi
    // không có ảnh nào nếu Drive lỗi (hết quyền truy cập, mất mạng...). Toàn bộ ghi DB bên dưới
    // chỉ chạy sau khi ảnh đã chắc chắn lên Drive thành công.
    const uploaded = await this.driveStorage.uploadToProjectPhase(
      project.driveAccountId,
      project.name,
      'Vật tư tập kết',
      file.originalname || `material-${Date.now()}.jpg`,
      file.mimetype,
      file.buffer,
    );

    await this.prisma.$transaction(async (tx) => {
      let item = existingItem;
      if (!item) {
        item = await tx.materialCheckItem.create({
          data: {
            materialCheckId: check.id,
            label: dto.label.trim(),
            category: dto.category ?? 'THO',
            quantityLabel: dto.quantityLabel,
            unitPrice: dto.unitPrice,
            contractValue: dto.contractValue,
            submittedByRole: member.role,
            steps: dto.stepIds?.length ? { connect: dto.stepIds.map((id) => ({ id })) } : undefined,
          },
          include: { batches: { orderBy: { batchNumber: 'desc' }, take: 1 } },
        });
      } else if (dto.category || dto.quantityLabel || dto.unitPrice != null || dto.contractValue != null || dto.stepIds) {
        // Cho phép bổ sung/sửa chi tiết (hạng mục dùng cho, giá, số lượng) ở lần nộp ảnh sau, không
        // bắt buộc phải khai đủ ngay từ ảnh đầu tiên.
        await tx.materialCheckItem.update({
          where: { id: item.id },
          data: {
            category: dto.category,
            quantityLabel: dto.quantityLabel,
            unitPrice: dto.unitPrice,
            contractValue: dto.contractValue,
            steps: dto.stepIds ? { set: dto.stepIds.map((id) => ({ id })) } : undefined,
          },
        });
      }

      // Đợt hiện tại: tái dùng đợt PENDING gần nhất (đang gom ảnh, chưa quyết định), hoặc mở đợt
      // MỚI nếu đợt gần nhất đã bị từ chối/duyệt — mỗi đợt giữ lịch sử quyết định riêng (xem "Đợt
      // 1/Đợt 2" trong mockup Kiểm soát vật tư).
      const latestBatch = item.batches[0];
      let batch = latestBatch?.status === 'PENDING' ? latestBatch : null;
      if (!batch) {
        batch = await tx.materialDeliveryBatch.create({
          data: {
            itemId: item.id,
            batchNumber: (latestBatch?.batchNumber ?? 0) + 1,
            supplierName: dto.supplierName,
          },
        });
        // Đợt mới mở nghĩa là item quay lại chờ duyệt, dù trước đó có bị từ chối.
        if (item.status !== 'PENDING') {
          await tx.materialCheckItem.update({ where: { id: item.id }, data: { status: 'PENDING' } });
        }
      }

      await tx.materialCheckPhoto.create({
        data: { batchId: batch.id, uploaderId: actorId, objectKey: uploaded.fileId },
      });
    });

    return this.getOrCreate(projectId, actorId);
  }

  /** Sửa chi tiết 1 loại vật tư (hạng mục dùng cho/giá/số lượng) không kèm ảnh mới. */
  async updateItemDetails(
    itemId: string,
    actorId: string,
    dto: {
      category?: MaterialCategory;
      quantityLabel?: string;
      unitPrice?: number;
      contractValue?: number;
      stepIds?: string[];
    },
  ) {
    const item = await this.prisma.materialCheckItem.findUnique({
      where: { id: itemId },
      include: { materialCheck: true },
    });
    if (!item) throw new NotFoundException();
    await this.projects.requireMember(item.materialCheck.projectId, actorId, [item.submittedByRole]);
    if (item.materialCheck.status === 'APPROVED') {
      throw new BadRequestException('Vật tư đã được duyệt, không sửa được nữa');
    }
    return this.prisma.materialCheckItem.update({
      where: { id: itemId },
      data: {
        category: dto.category,
        quantityLabel: dto.quantityLabel,
        unitPrice: dto.unitPrice,
        contractValue: dto.contractValue,
        steps: dto.stepIds ? { set: dto.stepIds.map((id) => ({ id })) } : undefined,
      },
    });
  }

  async removePhoto(photoId: string, actorId: string) {
    const photo = await this.prisma.materialCheckPhoto.findUnique({
      where: { id: photoId },
      include: { batch: { include: { item: { include: { materialCheck: true } } } } },
    });
    if (!photo) throw new NotFoundException();
    const { item, id: batchId } = photo.batch;
    const { materialCheck } = item;
    await this.projects.requireMember(materialCheck.projectId, actorId, [item.submittedByRole]);
    if (materialCheck.status === 'APPROVED') {
      throw new BadRequestException('Vật tư đã được duyệt, không xoá ảnh được nữa');
    }
    await this.prisma.materialCheckPhoto.delete({ where: { id: photoId } });
    // Đợt hết ảnh thì dọn luôn — tránh còn đợt rỗng làm rối UI/logic recompute.
    const remaining = await this.prisma.materialCheckPhoto.count({ where: { batchId } });
    if (remaining === 0) {
      await this.prisma.materialDeliveryBatch.delete({ where: { id: batchId } });
      const remainingBatches = await this.prisma.materialDeliveryBatch.count({ where: { itemId: item.id } });
      if (remainingBatches === 0) {
        await this.prisma.materialCheckItem.delete({ where: { id: item.id } });
      }
    }
    return this.getOrCreate(materialCheck.projectId, actorId);
  }

  async submit(projectId: string, actorId: string, note?: string) {
    await this.projects.requireMember(projectId, actorId, ['MAIN_CONTRACTOR', 'OWNER']);
    const check = await this.getOrCreate(projectId, actorId);
    if (!['PENDING', 'REJECTED'].includes(check.status)) {
      throw new BadRequestException('Vật tư đã được nộp hoặc đã duyệt rồi');
    }
    if (check.items.length === 0) {
      throw new BadRequestException('Cần ít nhất 1 loại vật tư (kèm ảnh) trước khi nộp để kiểm tra');
    }
    // Nộp lại sau khi bị từ chối — cho MỌI item còn REJECTED 1 lượt xem lại (mở lại đúng đợt gần
    // nhất), kể cả khi thầu quên bổ sung ảnh mới, để không bị kẹt vĩnh viễn ở trạng thái từ chối.
    for (const item of check.items) {
      if (item.status !== 'REJECTED') continue;
      const latestBatch = item.batches[item.batches.length - 1];
      if (latestBatch) {
        await this.prisma.materialDeliveryBatch.update({
          where: { id: latestBatch.id },
          data: { status: 'PENDING', note: null, decidedAt: null, decidedById: null },
        });
      }
      await this.prisma.materialCheckItem.update({ where: { id: item.id }, data: { status: 'PENDING' } });
    }
    const updated = await this.prisma.materialCheck.update({
      where: { id: check.id },
      data: { status: 'SUBMITTED', submittedAt: new Date(), note },
    });
    await this.activity.log(
      projectId,
      'MATERIAL_CHECK_SUBMITTED',
      'Vật tư tập kết đã được nộp để kiểm tra',
      { actorId },
    );
    await this.notifications.notifyProject(projectId, {
      title: 'Vật tư chờ kiểm tra',
      body: 'Có vật tư mới được nộp, cần kiểm tra số lượng và duyệt.',
      excludeUserId: actorId,
      type: 'MATERIAL_CHECK_SUBMITTED',
      data: { projectId },
    });
    return updated;
  }

  /** Duyệt/từ chối 1 đợt tập kết — thay cho duyệt cả loại vật tư 1 lần (mỗi đợt giữ quyết định
   * riêng, không ghi đè lịch sử các đợt trước). */
  async decideBatch(batchId: string, actorId: string, approve: boolean, note?: string) {
    const batch = await this.prisma.materialDeliveryBatch.findUnique({
      where: { id: batchId },
      include: { item: { include: { materialCheck: true } } },
    });
    if (!batch) throw new NotFoundException();
    const { item } = batch;
    const { materialCheck } = item;
    await this.projects.requireMember(materialCheck.projectId, actorId, [
      this.deciderRoleFor(item.submittedByRole),
    ]);
    if (materialCheck.status !== 'SUBMITTED') {
      throw new BadRequestException('Chỉ duyệt vật tư khi đang ở trạng thái chờ duyệt');
    }
    if (batch.status !== 'PENDING') {
      throw new BadRequestException('Đợt tập kết này đã được quyết định rồi');
    }
    if (!approve && !note?.trim()) {
      throw new ForbiddenException('Cần ghi chú lý do từ chối');
    }

    const newStatus = approve ? 'APPROVED' : 'REJECTED';
    const updatedBatch = await this.prisma.materialDeliveryBatch.update({
      where: { id: batchId },
      data: { status: newStatus, note: note?.trim(), decidedAt: new Date(), decidedById: actorId },
    });
    await this.prisma.materialCheckItem.update({ where: { id: item.id }, data: { status: newStatus } });
    const decider = this.roleLabel(this.deciderRoleFor(item.submittedByRole));
    const deciderLabel = decider.charAt(0).toUpperCase() + decider.slice(1);
    await this.activity.log(
      materialCheck.projectId,
      'MATERIAL_CHECK_DECIDED',
      approve
        ? `${deciderLabel} đã duyệt vật tư "${item.label}" (đợt ${batch.batchNumber})`
        : `${deciderLabel} từ chối vật tư "${item.label}" (đợt ${batch.batchNumber})${note ? `: ${note}` : ''}`,
      { actorId },
    );

    await this.recomputeCheckStatus(materialCheck.id, materialCheck.projectId, actorId);
    return updatedBatch;
  }

  /** Bình luận tự do trên 1 đợt tập kết — thầu/giám sát/chủ nhà đều dùng được, khác quyết định
   * duyệt/từ chối (chỉ bên đối diện bên đã khai báo item, xem decideBatch). */
  async postBatchComment(batchId: string, actorId: string, body: string) {
    if (!body?.trim()) throw new BadRequestException('Cần nội dung bình luận');
    const batch = await this.prisma.materialDeliveryBatch.findUnique({
      where: { id: batchId },
      include: { item: { include: { materialCheck: true } } },
    });
    if (!batch) throw new NotFoundException();
    await this.projects.requireMember(batch.item.materialCheck.projectId, actorId);
    return this.prisma.materialBatchComment.create({
      data: { batchId, authorId: actorId, body: body.trim() },
      include: { author: { select: { id: true, name: true } } },
    });
  }

  /** Tính lại status tổng của cổng duyệt sau khi 1 item vừa được quyết định — chỉ APPROVED khi
   * MỌI item đều APPROVED; còn item nào REJECTED thì tổng cũng REJECTED (cần nộp lại); còn item
   * PENDING thì tổng vẫn SUBMITTED (chưa xong hết). Chỉ báo thông báo lúc tổng CHỐT xong (không còn
   * item PENDING) — tránh spam mỗi lần chủ nhà duyệt 1 item riêng lẻ. */
  private async recomputeCheckStatus(checkId: string, projectId: string, actorId: string) {
    const items = await this.prisma.materialCheckItem.findMany({ where: { materialCheckId: checkId } });
    if (items.some((i) => i.status === 'PENDING')) return;

    const allApproved = items.every((i) => i.status === 'APPROVED');
    const newStatus = allApproved ? 'APPROVED' : 'REJECTED';
    await this.prisma.materialCheck.update({
      where: { id: checkId },
      data: { status: newStatus, decidedAt: new Date(), decidedById: actorId },
    });
    await this.notifications.notifyProject(projectId, {
      title: allApproved ? 'Vật tư đã được duyệt' : 'Vật tư bị từ chối',
      body: allApproved
        ? 'Toàn bộ vật tư đã được duyệt, có thể duyệt kế hoạch để bắt đầu thi công.'
        : 'Có loại vật tư bị từ chối, xem chi tiết và bổ sung lại.',
      excludeUserId: actorId,
      type: 'MATERIAL_CHECK_DECIDED',
      data: { projectId },
    });
  }
}
