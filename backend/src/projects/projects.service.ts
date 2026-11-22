import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContractType, ProjectRole, TeamType } from '@prisma/client';
import { ActivityService } from '../activity/activity.service';
import { AffiliateService } from '../affiliate/affiliate.service';
import { CrewService } from '../crew/crew.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { STANDARD_TEMPLATE_NAME, templatePhaseAppliesToContract } from './contract-scope.util';
import { phaseInScope } from './member-scope';
import { projectWritable, trialStart } from '../billing/read-only.middleware';
import { inviteEmailHtml, sendMail } from '../mail/mailer';

@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private activity: ActivityService,
    private notifications: NotificationsService,
    private crew: CrewService,
    private scheduling: SchedulingService,
    private affiliate: AffiliateService,
  ) {}

  /** Trả về membership; ném lỗi nếu user không thuộc dự án hoặc sai vai trò. */
  async requireMember(projectId: string, userId: string, roles?: ProjectRole[]) {
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!member) throw new ForbiddenException('Bạn không thuộc dự án này');
    if (roles && !roles.includes(member.role)) {
      throw new ForbiddenException(`Cần vai trò: ${roles.join(', ')}`);
    }
    return member;
  }

  async listMine(userId: string) {
    const projects = await this.prisma.project.findMany({
      where: { members: { some: { userId } } },
      include: {
        members: { include: { user: { select: { id: true, name: true, phone: true } } } },
        phases: { select: { id: true, code: true, name: true, order: true, status: true } },
        materialCheck: { select: { status: true } },
        // Chỉ lấy userId của tài khoản Drive để tính canManageDrive bên dưới — KHÔNG lộ token gì
        // cả qua API này, bản thân field được strip ra khỏi response trước khi trả về.
        driveAccount: { select: { userId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    // SĐT liên hệ của thành viên chỉ hiện với chủ nhà/thầu chính (điều phối đội thi công) — thầu
    // phụ/giám sát chỉ thấy tên + vai trò của người khác, tránh lộ số điện thoại không cần thiết.
    const writable = await Promise.all(projects.map((p) => projectWritable(this.prisma, p.id)));
    return projects.map(({ driveAccount, ...project }, idx) => {
      const myRole = project.members.find((m) => m.userId === userId)?.role;
      const canSeeContacts = myRole === 'OWNER' || myRole === 'MAIN_CONTRACTOR';
      // Dự án có thể được THẦU tạo (tự chọn Drive của chính họ, xem `create` ở trên) — không phải
      // luôn là chủ nhà, nên phải so sánh đúng chủ tài khoản Drive đã kết nối với người đang xem,
      // không được giả định cứng "chỉ OWNER mới kết nối lại được" (dùng ở showDriveUploadError,
      // mobile src/googleDrive.ts).
      const canManageDrive = driveAccount?.userId === userId;
      // 1 dự án = 1 bên trả (người tạo); thành viên được mời dùng miễn phí.
      const billingOwner = project.members.find((m) => m.userId === project.billingOwnerId)?.user;
      const base = {
        ...project,
        canManageDrive,
        isBillingOwner: project.billingOwnerId === userId,
        readOnly: !writable[idx],
        trialStartedAt: trialStart(project.createdAt),
        billingOwnerName: billingOwner?.name ?? null,
      };
      if (canSeeContacts) return base;
      return {
        ...base,
        members: project.members.map((m) => ({
          ...m,
          user: { ...m.user, phone: m.userId === userId ? m.user.phone : null },
        })),
      };
    });
  }

  /**
   * Xoá hẳn 1 dự án — CHỈ chủ nhà (OWNER) được xoá, không phải thầu chính dù họ là người tạo dự án
   * (tránh thầu tự ý xoá dự án của khách). Xoá vĩnh viễn, không khôi phục được: mọi dữ liệu con
   * (thành viên, hạng mục/bước, ảnh bằng chứng, vật tư, ứng tiền, lỗi, nhật ký...) đều cascade xoá
   * theo `onDelete: Cascade` trên Project trong schema. Báo trước cho các thành viên khác vì sau
   * khi xoá sẽ không còn dự án để tra cứu lịch sử thông báo nữa.
   */
  async deleteProject(projectId: string, actorId: string) {
    await this.requireMember(projectId, actorId, ['OWNER']);
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException();
    await this.notifications.notifyProject(projectId, {
      title: 'Dự án đã bị xoá',
      body: `Chủ nhà đã xoá dự án "${project.name}". Toàn bộ dữ liệu liên quan không còn truy cập được.`,
      excludeUserId: actorId,
      type: 'PROJECT_DELETED',
    });
    await this.prisma.project.delete({ where: { id: projectId } });
    return { ok: true };
  }

  /**
   * Nhà thầu tạo dự án theo gói (requirements §3–4): dự án đầu tiên dùng thử miễn phí; sau đó cần
   * gói — Theo tháng: 1 dự án đang chạy, 10 dự án: 10 dự án tạo trong hạn gói, Gói năm: không giới hạn.
   */
  private async assertContractorProjectQuota(userId: string) {
    const now = new Date();
    const active = await this.prisma.subscription.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        plan: { in: ['CONTRACTOR_MONTHLY', 'CONTRACTOR_10PROJECTS', 'CONTRACTOR_YEARLY'] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });
    if (active.some((s) => s.plan === 'CONTRACTOR_YEARLY')) return;
    const created = await this.prisma.project.count({ where: { billingOwnerId: userId } });
    if (created === 0) return;
    const pack = active.find((s) => s.plan === 'CONTRACTOR_10PROJECTS');
    if (pack) {
      const createdInPack = await this.prisma.project.count({ where: { billingOwnerId: userId, createdAt: { gte: pack.startedAt } } });
      if (createdInPack < 10) return;
    }
    if (active.some((s) => s.plan === 'CONTRACTOR_MONTHLY')) {
      const running = await this.prisma.project.count({ where: { billingOwnerId: userId, status: { not: 'DONE' } } });
      if (running < 1) return;
    }
    throw new BadRequestException('Đã hết số dự án theo gói hiện tại — nâng cấp gói Nhà thầu để tạo thêm dự án');
  }

  /**
   * Chủ nhà tạo dự án: copy toàn bộ hạng mục của template quy trình chuẩn thành phases/steps thật.
   * Mọi phase/step đều LOCKED — quy trình chỉ thật sự "chạy" (mở bước đầu tiên) sau khi kế hoạch
   * được duyệt (xem `approvePlan`). Trong lúc PLANNING, thầu/chủ nhà có thể thêm/bớt cả hạng mục
   * lẫn từng bước tuỳ ý (xem `removePhase`, `addPhase`, `addNegotiatedStep`, `removeStep`).
   */
  async create(
    userId: string,
    dto: {
      name: string;
      address?: string;
      floors?: string;
      buildingType?: string;
      expectedStartDate?: string;
      expectedEndDate?: string;
      templateId?: string;
      contractType?: ContractType;
      driveAccountId: string;
      creatorRole?: ProjectRole;
      /** Mã hạng mục (Phase.code, VD "B-03") bị bỏ chọn ở bước "Chọn bước thi công áp dụng" lúc
       * tạo dự án — không copy vào kế hoạch. Xem `getTemplatePhases` (mobile dùng để hiện checklist). */
      excludePhaseCodes?: string[];
      /** Hạng mục Add-on tự thêm ngay lúc tạo dự án (VD "Lắp Smart Home") — cùng bước với chọn
       * checklist trong wizard tạo dự án (mobile), khác với `addPhase` (thêm SAU khi dự án đã tồn
       * tại, dùng ở màn Kế hoạch thi công). Steps bên trong luôn `mandatory: false` (bước thương
       * lượng) như `applyAddStep`. */
      customPhases?: { name: string; steps: { name: string }[] }[];
      /** Bước nhỏ tuỳ chỉnh thêm vào hạng mục chuẩn (mockup 06), theo mã hạng mục. */
      extraSteps?: { phaseCode: string; name: string }[];
    },
  ) {
    const creatorRole = dto.creatorRole ?? 'OWNER';
    // Chủ nhà chỉ được đứng tên tối đa 1 dự án.
    if (creatorRole === 'OWNER') {
      const existingOwned = await this.prisma.projectMember.findFirst({
        where: { userId, role: 'OWNER' },
      });
      if (existingOwned) {
        throw new BadRequestException('Chủ nhà chỉ được tạo tối đa 1 dự án');
      }
    } else {
      await this.assertContractorProjectQuota(userId);
    }

    const driveAccount = await this.prisma.googleDriveAccount.findUnique({
      where: { id: dto.driveAccountId },
    });
    if (!driveAccount || driveAccount.userId !== userId) {
      throw new BadRequestException('Tài khoản Google Drive không hợp lệ, hãy kết nối lại trong Hồ sơ');
    }

    const template = dto.templateId
      ? await this.prisma.processTemplate.findUnique({
          where: { id: dto.templateId },
          include: { phases: { include: { steps: true }, orderBy: { order: 'asc' } } },
        })
      : await this.prisma.processTemplate.findFirst({
          where: { name: STANDARD_TEMPLATE_NAME },
          include: { phases: { include: { steps: true }, orderBy: { order: 'asc' } } },
        });
    if (!template) throw new NotFoundException('Chưa có template quy trình (chạy seed trước)');

    const contractType = dto.contractType ?? 'THO_VA_NHAN_CONG_HOAN_THIEN';
    // Nhà cải tạo/chung cư đã có sẵn kết cấu — không cần copy hạng mục kết cấu thô (móng, cột/dầm/
    // sàn, mái...) vào kế hoạch, xem `templatePhaseAppliesToContract`.
    const excludePhaseCodes = new Set(dto.excludePhaseCodes ?? []);
    const applicablePhases = template.phases.filter(
      (p) => templatePhaseAppliesToContract(p.scope, contractType) && !excludePhaseCodes.has(p.code),
    );

    const validCustomPhases = (dto.customPhases ?? [])
      .map((p) => ({ name: p.name?.trim(), steps: (p.steps ?? []).filter((s) => s.name?.trim()) }))
      .filter((p) => p.name && p.steps.length > 0);
    const customPhasesData = validCustomPhases.map((p, i) => ({
      code: `CUSTOM-${Date.now().toString(36).toUpperCase()}-${i}`,
      order: applicablePhases.length + i + 1,
      name: p.name!,
      status: 'LOCKED' as const,
      steps: {
        create: p.steps.map((s, j) => ({
          order: j + 1,
          name: s.name.trim(),
          mandatory: false,
          minPhotos: 1,
          requiresVideo: false,
          status: 'LOCKED' as const,
        })),
      },
    }));

    const project = await this.prisma.project.create({
      data: {
        name: dto.name,
        address: dto.address,
        floors: dto.floors,
        buildingType: dto.buildingType,
        expectedStartDate: dto.expectedStartDate ? new Date(dto.expectedStartDate) : undefined,
        expectedEndDate: dto.expectedEndDate ? new Date(dto.expectedEndDate) : undefined,
        status: 'PLANNING',
        contractType,
        driveAccountId: dto.driveAccountId,
        billingOwnerId: userId,
        templateId: template.id,
        members: { create: { userId, role: creatorRole } },
        // Cổng duyệt vật tư — tạo sẵn PENDING, chỉ thật sự chặn duyệt kế hoạch khi
        // contractType khác NHAN_CONG (xem `approvePlan`).
        materialCheck: { create: {} },
        phases: {
          create: [
            ...applicablePhases.map((p) => ({
              code: p.code,
              order: p.order,
              name: p.name,
              status: 'LOCKED' as const,
              plannedDurationDays: p.defaultDurationDays,
              steps: {
                create: p.steps
                  .sort((a, b) => a.order - b.order)
                  .map((s) => ({
                    order: s.order,
                    name: s.name,
                    acceptance: s.acceptance,
                    mandatory: s.mandatory,
                    minPhotos: s.minPhotos,
                    requiresVideo: s.requiresVideo,
                    floorLabel: s.floorLabel,
                    status: 'LOCKED' as const,
                  }))
                  .concat(
                    (dto.extraSteps ?? [])
                      .filter((x) => x.phaseCode === p.code && x.name?.trim())
                      .map((x, j) => ({
                        order: p.steps.length + j + 1,
                        name: x.name.trim(),
                        acceptance: null,
                        mandatory: false,
                        minPhotos: 1,
                        requiresVideo: false,
                        floorLabel: null,
                        status: 'LOCKED' as const,
                      })),
                  ),
              },
            })),
            ...customPhasesData,
          ],
        },
      },
      include: { phases: { include: { steps: true } } },
    });
    // Nối chuỗi phụ thuộc CPM mặc định (tuần tự theo order) — nếu không, mọi bước sẽ neo vào hôm
    // nay lúc tính lịch (xem SchedulingService.getSchedule), vô nghĩa cho Dashboard/Nhật ký ngày.
    await this.scheduling.relinkSequentialSchedule(project.id);
    return project;
  }

  /** Danh sách hạng mục của quy trình chuẩn theo hình thức hợp đồng — dùng cho checklist "Chọn
   * bước thi công áp dụng" lúc tạo dự án (mobile), trước khi dự án tồn tại nên không dùng
   * `requireMember` được. Không auth theo project vì chưa có project — chỉ cần đăng nhập. */
  async getTemplatePhases(contractType: ContractType) {
    const template = await this.prisma.processTemplate.findFirst({
      where: { name: STANDARD_TEMPLATE_NAME },
      include: { phases: { orderBy: { order: 'asc' }, include: { steps: { select: { name: true, order: true, floorLabel: true }, orderBy: { order: 'asc' } } } } },
    });
    if (!template) return [];
    // stepCount + repeatsPerFloor cho màn "Chọn bước thi công" (mockup 05: "4 bước nhỏ", "Lặp/tầng").
    return template.phases
      .filter((p) => templatePhaseAppliesToContract(p.scope, contractType))
      .map((p) => ({
        code: p.code,
        name: p.name,
        order: p.order,
        stepCount: p.steps.length,
        stepNames: p.steps.map((s) => s.name),
        repeatsPerFloor: p.steps.some((s) => !!s.floorLabel),
      }));
  }

  /** Danh sách hạng mục chuẩn chưa có trong dự án — để hiện nút "thêm lại" lúc lập kế hoạch. */
  async getPlanOptions(projectId: string, userId: string) {
    await this.requireMember(projectId, userId);
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException();
    const currentCodes = (
      await this.prisma.phase.findMany({ where: { projectId }, select: { code: true } })
    ).map((p) => p.code);

    if (!project.templateId) return { availablePhases: [] };
    const template = await this.prisma.processTemplate.findUnique({
      where: { id: project.templateId },
      include: { phases: { orderBy: { order: 'asc' }, include: { steps: true } } },
    });
    const availablePhases = (template?.phases ?? [])
      .filter(
        (p) =>
          !currentCodes.includes(p.code) &&
          templatePhaseAppliesToContract(p.scope, project.contractType),
      )
      .map((p) => ({ code: p.code, name: p.name, order: p.order, stepCount: p.steps.length }));
    return { availablePhases };
  }

  /**
   * Thực thi thêm 1 hạng mục — KHÔNG check quyền/trạng thái dự án, chỉ chứa logic nghiệp vụ
   * (lookup template hoặc tạo tuỳ chỉnh). Dùng lại bởi `addPhase` (chủ nhà sửa trực tiếp lúc
   * PLANNING) và `PlanChangeService.decide` (áp dụng đề xuất đã được duyệt).
   */
  async applyAddPhase(projectId: string, dto: { code?: string; name?: string }) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException();
    const existing = await this.prisma.phase.findMany({ where: { projectId } });
    const nextOrder = Math.max(0, ...existing.map((p) => p.order)) + 1;

    if (dto.code) {
      if (existing.some((p) => p.code === dto.code)) {
        throw new BadRequestException('Hạng mục này đã có trong dự án');
      }
      if (!project.templateId) throw new BadRequestException('Dự án không có template gốc');
      const templatePhase = await this.prisma.templatePhase.findFirst({
        where: { templateId: project.templateId, code: dto.code },
        include: { steps: true },
      });
      if (!templatePhase) throw new NotFoundException('Không tìm thấy hạng mục chuẩn này');
      const created = await this.prisma.phase.create({
        data: {
          projectId,
          code: templatePhase.code,
          order: templatePhase.order,
          name: templatePhase.name,
          status: 'LOCKED',
          plannedDurationDays: templatePhase.defaultDurationDays,
          steps: {
            create: templatePhase.steps
              .sort((a, b) => a.order - b.order)
              .map((s) => ({
                order: s.order,
                name: s.name,
                acceptance: s.acceptance,
                mandatory: s.mandatory,
                minPhotos: s.minPhotos,
                requiresVideo: s.requiresVideo,
                floorLabel: s.floorLabel,
                status: 'LOCKED',
              })),
          },
        },
        include: { steps: true },
      });
      await this.scheduling.relinkSequentialSchedule(projectId);
      return created;
    }

    if (!dto.name?.trim()) throw new BadRequestException('Cần tên hạng mục');
    const code = `CUSTOM-${Date.now().toString(36).toUpperCase()}`;
    return this.prisma.phase.create({
      data: { projectId, code, order: nextOrder, name: dto.name.trim(), status: 'LOCKED' },
      include: { steps: true },
    });
  }

  /**
   * Chủ nhà thêm 1 hạng mục vào dự án khi PLANNING — từ template chuẩn (theo code) hoặc tự tạo
   * tuỳ chỉnh. Thầu chính không còn sửa trực tiếp được nữa, phải đề xuất qua PlanChangeService.
   */
  async addPhase(
    projectId: string,
    actorId: string,
    dto: { code?: string; name?: string },
  ) {
    await this.requireMember(projectId, actorId, ['OWNER']);
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException();
    if (project.status !== 'PLANNING') {
      throw new BadRequestException('Chỉ sửa kế hoạch khi dự án đang lập kế hoạch');
    }
    const phase = await this.applyAddPhase(projectId, dto);
    await this.activity.log(projectId, 'PHASE_ADDED', `Chủ nhà đã thêm hạng mục "${phase.name}" vào kế hoạch`, {
      actorId,
    });
    await this.notifications.notifyProject(projectId, {
      title: 'Kế hoạch có hạng mục mới',
      body: `Chủ nhà đã thêm hạng mục "${phase.name}" vào kế hoạch.`,
      excludeUserId: actorId,
      type: 'PHASE_ADDED',
      data: { projectId },
    });
    return phase;
  }

  /** Thực thi đổi thứ tự hạng mục — KHÔNG check quyền/trạng thái dự án. */
  async applyReorderPhases(projectId: string, phaseIds: string[]) {
    const existing = await this.prisma.phase.findMany({ where: { projectId } });
    if (
      phaseIds.length !== existing.length ||
      !existing.every((p) => phaseIds.includes(p.id))
    ) {
      throw new BadRequestException('Danh sách hạng mục không khớp với dự án');
    }
    await this.prisma.$transaction(
      phaseIds.map((id, index) =>
        this.prisma.phase.update({ where: { id }, data: { order: index + 1 } }),
      ),
    );
    await this.scheduling.relinkSequentialSchedule(projectId);
    return this.prisma.phase.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
      include: { steps: { orderBy: { order: 'asc' } } },
    });
  }

  /**
   * Chủ nhà đổi thứ tự các hạng mục khi đang PLANNING — nhận đủ danh sách phaseId theo thứ tự mới
   * mong muốn, ghi lại field `order` tương ứng (1, 2, 3...). Dùng cho nút kéo-thả ở mobile.
   */
  async reorderPhases(projectId: string, actorId: string, phaseIds: string[]) {
    await this.requireMember(projectId, actorId, ['OWNER']);
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException();
    if (project.status !== 'PLANNING') {
      throw new BadRequestException('Chỉ sửa kế hoạch khi dự án đang lập kế hoạch');
    }
    const phases = await this.applyReorderPhases(projectId, phaseIds);
    await this.activity.log(projectId, 'PHASE_REORDERED', 'Chủ nhà đã sắp xếp lại thứ tự hạng mục', {
      actorId,
    });
    await this.notifications.notifyProject(projectId, {
      title: 'Kế hoạch bị sửa',
      body: 'Chủ nhà đã sắp xếp lại thứ tự hạng mục.',
      excludeUserId: actorId,
      type: 'PHASE_REORDERED',
      data: { projectId },
    });
    return this.attachPlannedDates(phases, project.constructionStartDate ?? new Date());
  }

  /**
   * Thực thi import cả 1 tiến độ mới (từ file PDF/Excel AI đã parse) — THAY TOÀN BỘ cây hạng
   * mục/bước hiện có bằng bản draft. Chỉ gọi được qua PlanChangeRequest (IMPORT_SCHEDULE) đã được
   * chủ nhà duyệt — xem ImportScheduleService (đề xuất) + PlanChangeService.preValidate (chặn nếu
   * dự án không còn PLANNING nữa giữa lúc đề xuất và lúc duyệt, tránh xoá tiến độ đang thi công
   * dở). KHÔNG check quyền/trạng thái ở đây — theo đúng quy ước applyX của các hàm khác trong file
   * này, PlanChangeService chịu trách nhiệm validate trước khi gọi.
   */
  async applyImportSchedule(
    projectId: string,
    draftPhases: {
      code?: string;
      name: string;
      plannedDurationDays?: number;
      steps: {
        name: string;
        acceptance?: string;
        mandatory?: boolean;
        minPhotos?: number;
        requiresVideo?: boolean;
      }[];
    }[],
  ) {
    if (!Array.isArray(draftPhases) || draftPhases.length === 0) {
      throw new BadRequestException('Bản nháp tiến độ import rỗng, không thể áp dụng');
    }
    const existing = await this.prisma.phase.findMany({
      where: { projectId },
      include: { steps: { select: { id: true } } },
    });
    // Gỡ liên kết predecessor trước khi xoá — tương tự applyRemovePhase, tránh vi phạm khoá ngoại
    // tự tham chiếu của Step.
    await this.scheduling.clearPredecessorLinks(existing.flatMap((p) => p.steps.map((s) => s.id)));
    try {
      await this.prisma.$transaction([
        this.prisma.phase.deleteMany({ where: { projectId } }),
        ...draftPhases.map((phase, i) =>
          this.prisma.phase.create({
            data: {
              projectId,
              code: phase.code?.trim() || `IMPORT-${i + 1}`,
              order: i + 1,
              name: phase.name,
              status: 'LOCKED',
              plannedDurationDays: phase.plannedDurationDays ?? 7,
              steps: {
                create: phase.steps.map((s, j) => ({
                  order: j + 1,
                  name: s.name,
                  acceptance: s.acceptance,
                  mandatory: s.mandatory ?? true,
                  minPhotos: s.minPhotos ?? 1,
                  requiresVideo: s.requiresVideo ?? false,
                  status: 'LOCKED',
                })),
              },
            },
          }),
        ),
      ]);
    } catch {
      throw new BadRequestException(
        'Không thể thay thế kế hoạch — có hạng mục đang là mốc của 1 đợt ứng tiền, hãy sửa đợt ứng tiền trước.',
      );
    }
    await this.scheduling.relinkSequentialSchedule(projectId);
    return this.prisma.phase.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
      include: { steps: { orderBy: { order: 'asc' } } },
    });
  }

  /**
   * Thực thi xoá 1 hạng mục — KHÔNG check quyền/trạng thái dự án. Chỉ cho xoá hạng mục còn LOCKED
   * (chưa thi công) — hạng mục IN_PROGRESS/DONE không được xoá dù qua đề xuất hay sửa trực tiếp.
   */
  async applyRemovePhase(phaseId: string) {
    const phase = await this.prisma.phase.findUnique({
      where: { id: phaseId },
      include: { steps: { select: { id: true } } },
    });
    if (!phase) throw new NotFoundException();
    if (phase.status !== 'LOCKED') {
      throw new BadRequestException('Chỉ xoá được hạng mục chưa thi công');
    }
    const phaseCount = await this.prisma.phase.count({ where: { projectId: phase.projectId } });
    if (phaseCount <= 1) {
      throw new BadRequestException('Dự án cần ít nhất 1 hạng mục');
    }
    // Gỡ liên kết predecessor trỏ vào các bước sắp xoá trước — predecessorStepId không có onDelete
    // cascade, xoá thẳng sẽ vi phạm khoá ngoại nếu có bước khác đang trỏ vào (xem
    // SchedulingService.clearPredecessorLinks).
    await this.scheduling.clearPredecessorLinks(phase.steps.map((s) => s.id));
    try {
      const removed = await this.prisma.phase.delete({ where: { id: phaseId } });
      await this.scheduling.relinkSequentialSchedule(phase.projectId);
      return removed;
    } catch {
      throw new BadRequestException(
        'Không thể xoá. Hạng mục này đang là mốc của 1 đợt ứng tiền, hãy sửa đợt ứng tiền trước.',
      );
    }
  }

  /** Chủ nhà xoá hẳn 1 hạng mục (và toàn bộ bước trong đó) khi PLANNING. */
  async removePhase(phaseId: string, actorId: string) {
    const phase = await this.prisma.phase.findUnique({
      where: { id: phaseId },
      include: { project: true },
    });
    if (!phase) throw new NotFoundException();
    await this.requireMember(phase.projectId, actorId, ['OWNER']);
    if (phase.project.status !== 'PLANNING') {
      throw new BadRequestException('Chỉ sửa kế hoạch khi dự án đang lập kế hoạch');
    }
    const removed = await this.applyRemovePhase(phaseId);
    await this.activity.log(
      phase.projectId,
      'PHASE_REMOVED',
      `Chủ nhà đã xoá hạng mục "${phase.name}" khỏi kế hoạch`,
      { actorId },
    );
    await this.notifications.notifyProject(phase.projectId, {
      title: 'Kế hoạch bị sửa',
      body: `Chủ nhà đã xoá hạng mục "${phase.name}" khỏi kế hoạch.`,
      excludeUserId: actorId,
      type: 'PHASE_REMOVED',
      data: { projectId: phase.projectId },
    });
    return removed;
  }

  /** Chủ nhà chỉnh số ngày dự kiến hoàn thành 1 hạng mục khi PLANNING. */
  async adjustDuration(phaseId: string, actorId: string, plannedDurationDays: number) {
    const phase = await this.prisma.phase.findUnique({
      where: { id: phaseId },
      include: { project: true },
    });
    if (!phase) throw new NotFoundException();
    await this.requireMember(phase.projectId, actorId, ['OWNER']);
    if (phase.project.status !== 'PLANNING') {
      throw new BadRequestException('Chỉ sửa kế hoạch khi dự án đang lập kế hoạch');
    }
    const updated = await this.applyAdjustDuration(phaseId, plannedDurationDays);
    await this.activity.log(
      phase.projectId,
      'PHASE_DURATION_CHANGED',
      `Chủ nhà đổi thời gian dự kiến hạng mục "${phase.name}" thành ${plannedDurationDays} ngày`,
      { actorId },
    );
    await this.notifications.notifyProject(phase.projectId, {
      title: 'Kế hoạch bị sửa',
      body: `Thời gian dự kiến hạng mục "${phase.name}" đổi thành ${plannedDurationDays} ngày.`,
      excludeUserId: actorId,
      type: 'PHASE_DURATION_CHANGED',
      data: { projectId: phase.projectId },
    });
    return updated;
  }

  /** Thực thi đổi thời gian dự kiến — KHÔNG check quyền/trạng thái dự án. */
  async applyAdjustDuration(phaseId: string, plannedDurationDays: number) {
    if (!Number.isInteger(plannedDurationDays) || plannedDurationDays < 1) {
      throw new BadRequestException('Số ngày dự kiến phải là số nguyên dương');
    }
    const updated = await this.prisma.phase.update({
      where: { id: phaseId },
      data: { plannedDurationDays },
    });
    // Thời lượng từng bước được chia đều từ tổng của hạng mục (xem
    // SchedulingService.relinkSequentialSchedule) — phải tính lại khi tổng đổi.
    await this.scheduling.relinkSequentialSchedule(updated.projectId);
    return updated;
  }

  /**
   * Kiểm tra actor có được mời `targetRole` vào dự án không — dùng chung cho `addMember` (mời
   * bằng SĐT) và `InvitesService.send` (mời từ tab Khám phá) để tránh lặp logic phân quyền 2 nơi.
   * Chủ nhà (OWNER) chỉ mời được thầu chính/giám sát — thầu phụ do chính thầu chính mời và quản lý
   * (xem CrewService). Thầu chính (MAIN_CONTRACTOR) mời được thầu phụ, và mời được cả chủ nhà nếu
   * dự án chưa có ai — trường hợp dự án do thầu chính tự tạo (xem `create`).
   *
   * Thầu chính vẫn TỐI ĐA 1 người. Giám sát thì khác: TỐI ĐA 1 người xem TOÀN BỘ dự án (giám sát
   * toàn thời gian/bán thời gian, `assignedPhaseCodes`+`assignedStepIds` rỗng), nhưng KHÔNG giới
   * hạn số giám sát được mời theo từng bước/hạng mục cụ thể (task-based) — chủ nhà có thể mời nhiều
   * giám sát khác nhau cho các bước khác nhau. Xem `ProjectsService.getPhases`/`WorkflowService`.
   */
  async assertCanInvite(
    projectId: string,
    actorId: string,
    targetRole: ProjectRole,
    scope?: { assignedPhaseCodes?: string[]; assignedStepIds?: string[] },
  ) {
    const actor = await this.requireMember(projectId, actorId);
    const isScopedSupervisor =
      targetRole === 'SUPERVISOR' &&
      ((scope?.assignedPhaseCodes?.length ?? 0) > 0 || (scope?.assignedStepIds?.length ?? 0) > 0);
    if (actor.role === 'OWNER') {
      if (targetRole === 'MAIN_CONTRACTOR' || targetRole === 'SUPERVISOR') {
        if (!isScopedSupervisor) {
          const existing = await this.prisma.projectMember.findFirst({
            where: {
              projectId,
              role: targetRole,
              ...(targetRole === 'SUPERVISOR'
                ? { assignedPhaseCodes: { equals: [] }, assignedStepIds: { equals: [] } }
                : {}),
            },
          });
          if (existing) {
            throw new BadRequestException(
              targetRole === 'MAIN_CONTRACTOR'
                ? 'Dự án đã có thầu chính'
                : 'Dự án đã có giám sát xem toàn bộ dự án',
            );
          }
        }
        return actor;
      }
      // Mockup 07: chủ nhà mời được cả Đội trưởng (nhà tự quản, không có thầu chính).
      if (targetRole === 'SUB_CONTRACTOR') return actor;
      throw new BadRequestException('Chủ nhà chỉ mời được thầu chính, giám sát hoặc đội trưởng');
    }
    if (actor.role === 'MAIN_CONTRACTOR') {
      if (targetRole === 'SUB_CONTRACTOR') return actor;
      // Dự án do thầu tạo: thầu mời giám sát (theo bước hoặc toàn dự án) — mockup 07.
      if (targetRole === 'SUPERVISOR') return actor;
      if (targetRole === 'OWNER') {
        const hasOwner = await this.prisma.projectMember.findFirst({
          where: { projectId, role: 'OWNER' },
        });
        if (hasOwner) throw new BadRequestException('Dự án đã có chủ nhà');
        return actor;
      }
      throw new BadRequestException(
        'Thầu chính chỉ mời được đội trưởng, giám sát, hoặc chủ nhà nếu dự án chưa có',
      );
    }
    throw new ForbiddenException('Bạn không có quyền mời thành viên');
  }

  /**
   * Mời thành viên bằng SĐT — khác với thêm thẳng như trước đây, giờ luôn tạo lời mời PENDING
   * (trừ khi người đó đã là thành viên rồi, lúc đó chỉ đổi vai trò). Người được mời phải tự đăng
   * nhập và chấp nhận (`InvitesService.respond`) mới chính thức thành ProjectMember — tránh gán
   * nhầm SĐT hoặc ép người ta vào dự án họ chưa đồng ý. Thống nhất cơ chế với lời mời từ Khám phá.
   */
  async addMember(
    projectId: string,
    actorId: string,
    dto: {
      phone?: string;
      email?: string;
      name?: string;
      role: ProjectRole;
      assignedPhaseCodes?: string[];
      assignedStepIds?: string[];
      teamType?: TeamType;
    },
  ) {
    // Mời bằng email (mockup 07) hoặc SĐT (luồng cũ) — cần ít nhất 1 trong 2.
    const email = dto.email?.trim().toLowerCase() || undefined;
    const phone = dto.phone?.trim() || undefined;
    if (!email && !phone) throw new BadRequestException('Cần email hoặc số điện thoại');
    const actor = await this.assertCanInvite(projectId, actorId, dto.role, dto);

    // User được mời chưa từng đăng ký cũng cần referralCode ngay (cột NOT NULL + unique) — sinh
    // trước upsert, giống AuthService.requestOtp.
    const referralCodeForNewUser = await this.affiliate.generateReferralCode();
    // Email chưa đăng ký: tạo sẵn user chưa có mật khẩu — khi người đó đăng ký đúng email này, AuthService.register
    // nhận lại user này (đặt mật khẩu) thay vì báo trùng.
    const contact = (email ?? phone)!;
    const user = await this.prisma.user.upsert({
      where: email ? { email } : { phone },
      update: {},
      create: { email, phone: email ? undefined : phone, name: dto.name ?? contact, referralCode: referralCodeForNewUser },
    });

    // Thầu chính mời thầu phụ thành công → tự lưu vào đội thợ riêng để tái sử dụng lần sau.
    if (actor.role === 'MAIN_CONTRACTOR' && dto.role === 'SUB_CONTRACTOR' && phone) {
      await this.crew.autoSave(actorId, {
        phone,
        name: dto.name ?? phone,
        defaultRole: 'SUB_CONTRACTOR',
      });
    }

    const existingMember = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
    });
    if (existingMember) {
      // Đã là thành viên chính thức rồi — chỉ đổi vai trò/hạng mục gán, không cần chấp nhận lại.
      return this.prisma.projectMember.update({
        where: { projectId_userId: { projectId, userId: user.id } },
        data: {
          role: dto.role,
          assignedPhaseCodes: dto.assignedPhaseCodes ?? [],
          assignedStepIds: dto.assignedStepIds ?? [],
          teamType: dto.role === 'SUB_CONTRACTOR' ? dto.teamType : null,
        },
        include: { user: { select: { id: true, name: true, phone: true } } },
      });
    }

    const invite = await this.prisma.projectInvite.upsert({
      where: { projectId_inviteeId: { projectId, inviteeId: user.id } },
      update: {
        role: dto.role,
        assignedPhaseCodes: dto.assignedPhaseCodes ?? [],
        assignedStepIds: dto.assignedStepIds ?? [],
        teamType: dto.role === 'SUB_CONTRACTOR' ? dto.teamType : null,
        status: 'PENDING',
        respondedAt: null,
      },
      create: {
        projectId,
        inviteeId: user.id,
        inviterId: actorId,
        role: dto.role,
        assignedPhaseCodes: dto.assignedPhaseCodes ?? [],
        assignedStepIds: dto.assignedStepIds ?? [],
        teamType: dto.role === 'SUB_CONTRACTOR' ? dto.teamType : undefined,
      },
      include: { invitee: { select: { id: true, name: true, phone: true } } },
    });

    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    await this.notifications.notifyUser(user.id, {
      title: 'Lời mời tham gia dự án',
      body: `Bạn được mời tham gia "${project.name}", vào Hồ sơ để xem chi tiết.`,
      type: 'INVITE_RECEIVED',
    });
    // Mời bằng email: gửi email thật — người chưa có tài khoản không nhận được push/thông báo app.
    if (email) {
      const inviter = await this.prisma.user.findUnique({ where: { id: actorId }, select: { name: true } });
      const ROLE_VI: Record<string, string> = { OWNER: 'Chủ nhà', MAIN_CONTRACTOR: 'Nhà thầu', SUB_CONTRACTOR: 'Đội trưởng', SUPERVISOR: 'Giám sát' };
      await sendMail(
        email,
        `${inviter?.name ?? 'Một người'} mời bạn tham gia dự án "${project.name}"`,
        inviteEmailHtml({
          inviterName: inviter?.name ?? 'Một người',
          projectName: project.name,
          roleLabel: ROLE_VI[dto.role] ?? dto.role,
          hasAccount: !!user.passwordHash || !!user.phone,
        }),
      );
    }
    return invite;
  }

  /**
   * Thực thi thêm bước THƯƠNG LƯỢNG vào 1 phase — KHÔNG check quyền/trạng thái dự án. Mặc định
   * không bắt buộc (mandatory=false), nhưng có thể chọn bắt buộc ngay lúc thêm — bước bắt buộc thì
   * sau này chỉ chủ nhà xoá được (giống bước chuẩn), xem `applyRemoveStep`.
   */
  async applyAddStep(
    phaseId: string,
    dto: {
      name: string;
      acceptance?: string;
      minPhotos?: number;
      requiresVideo?: boolean;
      mandatory?: boolean;
      floorLabel?: string;
    },
  ) {
    const phase = await this.prisma.phase.findUnique({
      where: { id: phaseId },
      include: { steps: true },
    });
    if (!phase) throw new NotFoundException();
    const step = await this.prisma.step.create({
      data: {
        phaseId,
        order: Math.max(0, ...phase.steps.map((s) => s.order)) + 1,
        name: dto.name,
        acceptance: dto.acceptance,
        mandatory: dto.mandatory ?? false,
        minPhotos: dto.minPhotos ?? 1,
        requiresVideo: dto.requiresVideo ?? false,
        floorLabel: dto.floorLabel,
        status: 'LOCKED',
      },
    });
    await this.scheduling.relinkSequentialSchedule(phase.projectId);
    return step;
  }

  /** Chủ nhà thêm bước THƯƠNG LƯỢNG vào 1 phase khi đang PLANNING. */
  async addNegotiatedStep(
    phaseId: string,
    actorId: string,
    dto: {
      name: string;
      acceptance?: string;
      minPhotos?: number;
      requiresVideo?: boolean;
      mandatory?: boolean;
      floorLabel?: string;
    },
  ) {
    const phase = await this.prisma.phase.findUnique({
      where: { id: phaseId },
      include: { project: true },
    });
    if (!phase) throw new NotFoundException();
    await this.requireMember(phase.projectId, actorId, ['OWNER']);
    if (phase.project.status !== 'PLANNING') {
      throw new BadRequestException('Chỉ thêm bước khi dự án đang lập kế hoạch');
    }
    const step = await this.applyAddStep(phaseId, dto);
    await this.activity.log(
      phase.projectId,
      'STEP_ADDED',
      `Chủ nhà đã thêm bước "${step.name}" vào hạng mục "${phase.name}"`,
      { actorId, stepId: step.id },
    );
    await this.notifications.notifyProject(phase.projectId, {
      title: 'Kế hoạch có bước mới',
      body: `Chủ nhà đã thêm bước "${step.name}" vào hạng mục "${phase.name}".`,
      excludeUserId: actorId,
      type: 'STEP_ADDED',
      data: { projectId: phase.projectId },
    });
    return step;
  }

  /** Thực thi xoá bước — KHÔNG check quyền/trạng thái dự án. Chỉ bước thương lượng còn LOCKED. */
  async applyRemoveStep(stepId: string) {
    const step = await this.prisma.step.findUnique({
      where: { id: stepId },
      include: { phase: { select: { projectId: true } } },
    });
    if (!step) throw new NotFoundException();
    // Bước bắt buộc: chỉ chủ nhà được xoá — chặn thầu đề xuất xoá ở PlanChangeService.preValidate.
    if (step.status !== 'LOCKED') {
      throw new BadRequestException('Chỉ xoá được bước chưa thi công');
    }
    await this.scheduling.clearPredecessorLinks([stepId]);
    const removed = await this.prisma.step.delete({ where: { id: stepId } });
    await this.scheduling.relinkSequentialSchedule(step.phase.projectId);
    return removed;
  }

  /** Chủ nhà xóa bước (kể cả bước bắt buộc) chưa thi công, chỉ khi PLANNING. */
  async removeStep(stepId: string, actorId: string) {
    const step = await this.prisma.step.findUnique({
      where: { id: stepId },
      include: { phase: { include: { project: true } } },
    });
    if (!step) throw new NotFoundException();
    await this.requireMember(step.phase.projectId, actorId, ['OWNER']);
    if (step.phase.project.status !== 'PLANNING') {
      throw new BadRequestException('Chỉ sửa kế hoạch khi dự án đang lập kế hoạch');
    }
    const removed = await this.applyRemoveStep(stepId);
    await this.activity.log(
      step.phase.projectId,
      'STEP_REMOVED',
      `Chủ nhà đã xoá bước "${step.name}" khỏi hạng mục "${step.phase.name}"`,
      { actorId },
    );
    await this.notifications.notifyProject(step.phase.projectId, {
      title: 'Kế hoạch bị sửa',
      body: `Chủ nhà đã xoá bước "${step.name}" khỏi hạng mục "${step.phase.name}".`,
      excludeUserId: actorId,
      type: 'STEP_REMOVED',
      data: { projectId: step.phase.projectId },
    });
    return removed;
  }

  /**
   * Chủ nhà duyệt kế hoạch cuối cùng (sau khi đã thêm/bớt hạng mục + bước tuỳ ý) → dự án ACTIVE.
   * Đây là lúc quy trình thật sự bắt đầu: mở hạng mục đầu tiên (theo order) và bước đầu tiên của
   * nó — trước đó mọi phase/step đều LOCKED nên thầu không thể nộp bằng chứng trước khi được duyệt.
   */
  async approvePlan(projectId: string, actorId: string) {
    await this.requireMember(projectId, actorId, ['OWNER']);
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException();

    // Vật tư tập kết KHÔNG chặn duyệt kế hoạch — thầu khai báo vật tư trong từng bước sau khi đã duyệt.
    const phases = await this.prisma.phase.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
      include: { steps: { orderBy: { order: 'asc' } } },
    });
    if (phases.length === 0) {
      throw new BadRequestException('Kế hoạch cần ít nhất 1 hạng mục trước khi duyệt');
    }
    const firstPhase = phases[0];
    if (firstPhase.steps.length === 0) {
      throw new BadRequestException(
        `Hạng mục "${firstPhase.name}" chưa có bước nào, thêm ít nhất 1 bước hoặc xoá hạng mục này trước khi duyệt`,
      );
    }
    await this.prisma.phase.update({ where: { id: firstPhase.id }, data: { status: 'IN_PROGRESS' } });
    const firstStep = firstPhase.steps[0];
    await this.prisma.step.update({ where: { id: firstStep.id }, data: { status: 'OPEN' } });
    const constructionStartDate = new Date();
    const updated = await this.prisma.project.update({
      where: { id: projectId },
      // constructionStartDate neo lịch thi công dự kiến (xem `attachPlannedDates`) — chỉ set 1
      // lần lúc này, vì dự án chỉ chuyển PLANNING → ACTIVE đúng 1 lần trong vòng đời.
      data: { status: 'ACTIVE', constructionStartDate },
    });
    // Chụp baseline CPM ngay lúc duyệt kế hoạch — mốc "kế hoạch gốc" cố định để so sánh với thực tế
    // sau này (xem SchedulingService.captureBaseline), phải chạy sau khi anchor đã chốt ở trên.
    await this.scheduling.captureBaseline(projectId, constructionStartDate);
    await this.activity.log(projectId, 'PLAN_APPROVED', 'Chủ nhà đã duyệt kế hoạch, bắt đầu thi công', {
      actorId,
    });
    await this.notifications.notifyProject(projectId, {
      title: 'Kế hoạch đã được duyệt',
      body: 'Dự án bắt đầu thi công, bước đầu tiên đã mở.',
      excludeUserId: actorId,
      type: 'PLAN_APPROVED',
      data: { projectId },
    });
    return updated;
  }

  async getPhases(projectId: string, userId: string) {
    const member = await this.requireMember(projectId, userId);
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException();
    const phases = await this.prisma.phase.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
      include: {
        steps: {
          orderBy: { order: 'asc' },
          include: {
            evidences: true,
            approvals: { include: { approver: { select: { id: true, name: true } } } },
            // 2 comment mới nhất để hiện preview ngay trong danh sách bước (mockup "Báo cáo thi
            // công + Comment") — không kèm role tác giả (khác getStepDetail) để tránh phải resolve
            // ProjectMember theo từng author chỉ cho mục đích preview, xem StepDetail cho đủ.
            comments: {
              where: { evidenceId: null },
              orderBy: { createdAt: 'desc' },
              take: 2,
              include: { author: { select: { id: true, name: true } } },
            },
            _count: { select: { comments: true } },
          },
        },
      },
    });
    const withDates = this.attachPlannedDates(phases, project.constructionStartDate ?? new Date());
    // Thầu phụ chỉ được gán 1 phần hạng mục — chỉ nên thấy đúng phần việc của mình trên tab Tiến
    // độ, không thấy phần của thầu khác (khớp với `requireContractor` chặn thao tác ngoài phạm vi).
    if (member.role === 'SUB_CONTRACTOR') {
      return withDates.filter((p) => phaseInScope(member, p.code));
    }
    // Giám sát được mời theo hạng mục/bước cụ thể (task-based) chỉ thấy đúng phần được gán — giám
    // sát mời KHÔNG kèm phạm vi (assignedPhaseCodes/assignedStepIds rỗng) là giám sát toàn thời
    // gian/bán thời gian, xem toàn bộ dự án như trước giờ (khớp WorkflowService.requireUploader).
    if (member.role === 'SUPERVISOR') {
      if (member.assignedPhaseCodes.length > 0) {
        return withDates.filter((p) => member.assignedPhaseCodes.includes(p.code));
      }
      if (member.assignedStepIds.length > 0) {
        return withDates
          .map((p) => ({ ...p, steps: p.steps.filter((s) => member.assignedStepIds.includes(s.id)) }))
          .filter((p) => p.steps.length > 0);
      }
    }
    return withDates;
  }

  /**
   * Gắn plannedStartDate/plannedEndDate cho từng hạng mục — tính dồn theo `order` và
   * `plannedDurationDays`, neo tại `anchor` (constructionStartDate của dự án). Trước khi dự án
   * ACTIVE, `anchor` là hôm nay (bản xem trước lịch, chưa phải lịch chốt) — dùng cho màn Lịch thi
   * công (Gantt) ở mobile.
   */
  private attachPlannedDates<T extends { order: number; plannedDurationDays: number }>(
    phases: T[],
    anchor: Date,
  ): (T & { plannedStartDate: Date; plannedEndDate: Date })[] {
    let cursor = new Date(anchor);
    return phases
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((phase) => {
        const start = new Date(cursor);
        const end = new Date(cursor);
        end.setDate(end.getDate() + phase.plannedDurationDays);
        cursor = end;
        return { ...phase, plannedStartDate: start, plannedEndDate: end };
      });
  }
}
