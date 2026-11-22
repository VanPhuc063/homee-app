import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProjectRole } from '@prisma/client';
import { ActivityService } from '../activity/activity.service';
import { CrewService } from '../crew/crew.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';

/// Dùng cho nhật ký thi công — tránh in thẳng tên enum (VD "MAIN_CONTRACTOR") vào message hiển thị.
const ROLE_LABEL: Record<ProjectRole, string> = {
  OWNER: 'Chủ nhà',
  MAIN_CONTRACTOR: 'Thầu chính',
  SUB_CONTRACTOR: 'Thầu phụ',
  SUPERVISOR: 'Giám sát',
};

/**
 * Mời từ tab Khám phá — khác với mời trực tiếp bằng SĐT quen biết (ProjectsService.addMember,
 * thêm thẳng không cần chấp nhận), người được mời ở đây là người lạ tìm thấy qua hồ sơ công khai
 * nên cần chủ động accept/decline mới thành thành viên thật (ProjectMember).
 */
@Injectable()
export class InvitesService {
  constructor(
    private prisma: PrismaService,
    private projects: ProjectsService,
    private notifications: NotificationsService,
    private activity: ActivityService,
    private crew: CrewService,
  ) {}

  async send(
    projectId: string,
    inviterId: string,
    dto: {
      inviteeId: string;
      role: ProjectRole;
      assignedPhaseCodes?: string[];
      assignedStepIds?: string[];
    },
  ) {
    if (dto.inviteeId === inviterId) {
      throw new BadRequestException('Không thể tự mời chính mình');
    }
    const actor = await this.projects.assertCanInvite(projectId, inviterId, dto.role, dto);

    const existingMember = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: dto.inviteeId } },
    });
    if (existingMember) throw new BadRequestException('Người này đã là thành viên dự án');

    // Thầu chính mời thầu phụ thành công → tự lưu vào đội thợ riêng để tái sử dụng lần sau.
    if (actor.role === 'MAIN_CONTRACTOR' && dto.role === 'SUB_CONTRACTOR') {
      const invitee = await this.prisma.user.findUnique({ where: { id: dto.inviteeId } });
      // Đội thợ tái sử dụng theo SĐT — tài khoản đăng ký bằng email (không có SĐT) thì bỏ qua,
      // không có gì để lưu lại cho lần mời sau.
      if (invitee?.phone) {
        await this.crew.autoSave(inviterId, {
          phone: invitee.phone,
          name: invitee.name,
          defaultRole: 'SUB_CONTRACTOR',
        });
      }
    }

    const invite = await this.prisma.projectInvite.upsert({
      where: { projectId_inviteeId: { projectId, inviteeId: dto.inviteeId } },
      update: {
        role: dto.role,
        assignedPhaseCodes: dto.assignedPhaseCodes ?? [],
        assignedStepIds: dto.assignedStepIds ?? [],
        status: 'PENDING',
        respondedAt: null,
      },
      create: {
        projectId,
        inviteeId: dto.inviteeId,
        inviterId,
        role: dto.role,
        assignedPhaseCodes: dto.assignedPhaseCodes ?? [],
        assignedStepIds: dto.assignedStepIds ?? [],
      },
    });

    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    await this.notifications.notifyUser(dto.inviteeId, {
      title: 'Lời mời tham gia dự án',
      body: `Bạn được mời tham gia "${project.name}", vào Hồ sơ để xem chi tiết.`,
      type: 'INVITE_RECEIVED',
    });
    return invite;
  }

  myInvites(userId: string) {
    return this.prisma.projectInvite.findMany({
      where: { inviteeId: userId, status: 'PENDING' },
      include: {
        project: { select: { id: true, name: true, status: true } },
        inviter: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async projectInvites(projectId: string, userId: string) {
    await this.projects.requireMember(projectId, userId, ['OWNER', 'MAIN_CONTRACTOR']);
    return this.prisma.projectInvite.findMany({
      where: { projectId },
      include: { invitee: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async respond(inviteId: string, userId: string, accept: boolean) {
    const invite = await this.prisma.projectInvite.findUnique({ where: { id: inviteId } });
    if (!invite) throw new NotFoundException();
    if (invite.inviteeId !== userId) throw new ForbiddenException('Lời mời không dành cho bạn');
    if (invite.status !== 'PENDING') throw new BadRequestException('Lời mời đã được xử lý rồi');

    if (!accept) {
      const declined = await this.prisma.projectInvite.update({
        where: { id: inviteId },
        data: { status: 'DECLINED', respondedAt: new Date() },
        include: { project: { select: { name: true } } },
      });
      await this.activity.log(
        invite.projectId,
        'INVITE_DECLINED',
        `Lời mời tham gia vai trò ${ROLE_LABEL[invite.role]} đã bị từ chối`,
        { actorId: userId },
      );
      await this.notifications.notifyUser(invite.inviterId, {
        title: 'Lời mời bị từ chối',
        body: `Lời mời tham gia "${declined.project.name}" đã bị từ chối.`,
        type: 'INVITE_DECLINED',
        data: { projectId: invite.projectId },
      });
      return declined;
    }

    const [, updatedInvite] = await this.prisma.$transaction([
      this.prisma.projectMember.create({
        data: {
          projectId: invite.projectId,
          userId: invite.inviteeId,
          role: invite.role,
          assignedPhaseCodes: invite.assignedPhaseCodes,
          assignedStepIds: invite.assignedStepIds,
          teamType: invite.teamType,
        },
      }),
      this.prisma.projectInvite.update({
        where: { id: inviteId },
        data: { status: 'ACCEPTED', respondedAt: new Date() },
        include: { project: { select: { name: true } } },
      }),
    ]);
    await this.activity.log(
      invite.projectId,
      'INVITE_ACCEPTED',
      `Thành viên mới đã chấp nhận lời mời tham gia vai trò ${ROLE_LABEL[invite.role]}`,
      { actorId: userId },
    );
    await this.notifications.notifyUser(invite.inviterId, {
      title: 'Lời mời đã được chấp nhận',
      body: `Đã có thành viên mới tham gia "${updatedInvite.project.name}".`,
      type: 'INVITE_ACCEPTED',
      data: { projectId: invite.projectId },
    });
    return updatedInvite;
  }
}
