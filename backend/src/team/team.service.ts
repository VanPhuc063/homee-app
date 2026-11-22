import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EvidenceType } from '@prisma/client';
import { DriveStorageService } from '../google-drive/drive-storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

function toDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

const TEAM_TYPE_LABEL: Record<string, string> = {
  PHAN_THO: 'Phần thô',
  SON: 'Sơn',
  THACH_CAO: 'Thạch cao',
  DA: 'Đá',
  KINH_CAU_THANG: 'Kính cầu thang',
  CUA_NHOM: 'Cửa nhôm',
  KHAC: 'Khác',
};

/**
 * Quản lý đội thợ theo Requirements v2.1 §4.5.3-4.5.4 — "đội trưởng" là 1 ProjectMember role
 * SUB_CONTRACTOR có gắn `teamType` (mời qua ProjectsService.addMember/InvitesService.respond như
 * thầu phụ thường, chỉ khác là có teamType). Điểm danh/báo cáo đội tách khỏi AttendanceCheckIn
 * (vốn là chấm công cấp-dự án của SchedulingService) vì đây là chấm công CẤP-ĐỘI, theo từng thợ.
 */
@Injectable()
export class TeamService {
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

  /** Chỉ member đang gọi mới thao tác được với ĐỘI CỦA CHÍNH MÌNH — không cho đội trưởng này sửa
   * roster/điểm danh của đội trưởng khác. */
  private async requireOwnTeam(projectId: string, userId: string) {
    const member = await this.requireMember(projectId, userId);
    if (member.role !== 'SUB_CONTRACTOR' || !member.teamType) {
      throw new ForbiddenException('Bạn không phải đội trưởng của đội nào trong dự án này');
    }
    return member;
  }

  /** Tổng quan điểm danh — OWNER/MAIN_CONTRACTOR/SUPERVISOR xem được toàn bộ đội trong dự án. */
  async overview(projectId: string, userId: string) {
    const actor = await this.requireMember(projectId, userId);
    if (!['OWNER', 'MAIN_CONTRACTOR', 'SUPERVISOR'].includes(actor.role)) {
      throw new ForbiddenException('Bạn không có quyền xem tổng quan điểm danh');
    }

    const leaders = await this.prisma.projectMember.findMany({
      where: { projectId, role: 'SUB_CONTRACTOR', teamType: { not: null } },
      include: {
        user: { select: { id: true, name: true, phone: true } },
        teamWorkers: { where: { active: true } },
      },
    });

    const today = toDateOnly(new Date());
    const result = [];
    for (const leader of leaders) {
      const workerIds = leader.teamWorkers.map((w) => w.id);
      const attendanceToday = workerIds.length
        ? await this.prisma.teamAttendance.findMany({
            where: { teamWorkerId: { in: workerIds }, date: today },
          })
        : [];
      const reportToday = await this.prisma.teamDailyReport.findUnique({
        where: { projectMemberId_date: { projectMemberId: leader.id, date: today } },
      });
      const workerById = new Map(leader.teamWorkers.map((w) => [w.id, w]));
      const absentWorkers = attendanceToday
        .filter((a) => !a.present)
        .map((a) => ({
          name: workerById.get(a.teamWorkerId)?.name ?? '',
          reason: a.absenceReason,
        }));
      result.push({
        memberId: leader.id,
        teamType: leader.teamType,
        teamTypeLabel: TEAM_TYPE_LABEL[leader.teamType as string],
        leader: leader.user,
        workerCount: leader.teamWorkers.length,
        presentToday: attendanceToday.filter((a) => a.present).length,
        absentToday: attendanceToday.filter((a) => !a.present).length,
        absentWorkers,
        checkedInToday: attendanceToday.length > 0,
        reportSubmittedToday: !!reportToday,
      });
    }
    return result;
  }

  /** Màn của chính đội trưởng — roster + điểm danh hôm nay + báo cáo hôm nay (nếu đã gửi). */
  async myTeam(projectId: string, userId: string) {
    const member = await this.requireOwnTeam(projectId, userId);
    const today = toDateOnly(new Date());
    const workers = await this.prisma.teamWorker.findMany({
      where: { projectMemberId: member.id, active: true },
      include: { attendance: { where: { date: today } } },
      orderBy: { createdAt: 'asc' },
    });
    const report = await this.prisma.teamDailyReport.findUnique({
      where: { projectMemberId_date: { projectMemberId: member.id, date: today } },
      include: { media: true },
    });
    return {
      teamType: member.teamType,
      teamTypeLabel: TEAM_TYPE_LABEL[member.teamType as string],
      workers: workers.map((w) => ({
        id: w.id,
        name: w.name,
        present: w.attendance[0]?.present ?? null,
        absenceReason: w.attendance[0]?.absenceReason ?? null,
      })),
      report,
    };
  }

  async addWorker(projectId: string, userId: string, name: string) {
    const member = await this.requireOwnTeam(projectId, userId);
    if (!name?.trim()) throw new BadRequestException('Cần nhập tên thợ');
    return this.prisma.teamWorker.create({
      data: { projectMemberId: member.id, name: name.trim() },
    });
  }

  async removeWorker(workerId: string, userId: string) {
    const worker = await this.prisma.teamWorker.findUnique({
      where: { id: workerId },
      include: { leader: true },
    });
    if (!worker) throw new NotFoundException();
    if (worker.leader.userId !== userId) {
      throw new ForbiddenException('Chỉ đội trưởng của đội này mới xoá được thợ');
    }
    return this.prisma.teamWorker.update({ where: { id: workerId }, data: { active: false } });
  }

  /** Điểm danh cả đội cho hôm nay — gửi lại trong ngày thì ghi đè (giống AttendanceCheckIn). */
  async submitAttendance(
    projectId: string,
    userId: string,
    entries: { teamWorkerId: string; present: boolean; absenceReason?: string }[],
  ) {
    // Đội trưởng điểm danh đội mình; thầu chính điểm danh được mọi đội trong dự án (màn 20–21).
    const actor = await this.requireMember(projectId, userId);
    const isMain = actor.role === 'MAIN_CONTRACTOR';
    if (!isMain) await this.requireOwnTeam(projectId, userId);
    if (!entries?.length) throw new BadRequestException('Chưa điểm danh thợ nào');

    const workers = await this.prisma.teamWorker.findMany({
      where: {
        id: { in: entries.map((e) => e.teamWorkerId) },
        ...(isMain ? { leader: { projectId } } : { projectMemberId: actor.id }),
      },
      select: { id: true },
    });
    const validIds = new Set(workers.map((w) => w.id));
    const today = toDateOnly(new Date());

    await this.prisma.$transaction(
      entries
        .filter((e) => validIds.has(e.teamWorkerId))
        .map((e) =>
          this.prisma.teamAttendance.upsert({
            where: { teamWorkerId_date: { teamWorkerId: e.teamWorkerId, date: today } },
            create: {
              teamWorkerId: e.teamWorkerId,
              date: today,
              present: e.present,
              absenceReason: e.present ? undefined : e.absenceReason,
            },
            update: {
              present: e.present,
              absenceReason: e.present ? null : e.absenceReason,
            },
          }),
        ),
    );
    return { ok: true };
  }

  /** Báo cáo công việc hàng ngày — 0-1 ảnh/video đính kèm (giống AttendanceCheckIn: đơn giản, 1
   * file/lượt). Gửi lại trong ngày thì ghi đè nội dung text, KHÔNG xoá media cũ (cộng dồn). */
  async submitReport(
    projectId: string,
    userId: string,
    dto: { workDone: string; planTomorrow?: string; issues?: string },
    files: { originalname: string; mimetype: string; buffer: Buffer }[],
  ) {
    const member = await this.requireOwnTeam(projectId, userId);
    if (!dto.workDone?.trim()) {
      throw new BadRequestException('Cần ghi công việc đã làm trong ngày');
    }
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException();

    const today = toDateOnly(new Date());
    const report = await this.prisma.teamDailyReport.upsert({
      where: { projectMemberId_date: { projectMemberId: member.id, date: today } },
      create: {
        projectMemberId: member.id,
        date: today,
        workDone: dto.workDone.trim(),
        planTomorrow: dto.planTomorrow?.trim(),
        issues: dto.issues?.trim(),
      },
      update: {
        workDone: dto.workDone.trim(),
        planTomorrow: dto.planTomorrow?.trim(),
        issues: dto.issues?.trim(),
      },
    });

    if (files?.length) {
      if (!project.driveAccountId) {
        throw new BadRequestException(
          'Công trình chưa liên kết tài khoản Google Drive, chủ nhà cần chọn tài khoản lưu trữ trước',
        );
      }
      const teamLabel = TEAM_TYPE_LABEL[member.teamType as string] ?? 'Đội thợ';
      for (const file of files) {
        const uploaded = await this.driveStorage.uploadToProjectPhase(
          project.driveAccountId,
          project.name,
          `Báo cáo đội — ${teamLabel}`,
          file.originalname || `report-${Date.now()}.jpg`,
          file.mimetype,
          file.buffer,
        );
        await this.prisma.teamReportMedia.create({
          data: {
            reportId: report.id,
            objectKey: uploaded.fileId,
            type: file.mimetype.startsWith('video') ? EvidenceType.VIDEO : EvidenceType.PHOTO,
          },
        });
      }
    }

    const mainContractor = await this.prisma.projectMember.findFirst({
      where: { projectId, role: 'MAIN_CONTRACTOR' },
    });
    if (mainContractor) {
      await this.notifications.notifyUser(mainContractor.userId, {
        title: 'Đội trưởng gửi báo cáo',
        body: `${TEAM_TYPE_LABEL[member.teamType as string]}: ${dto.workDone.trim().slice(0, 120)}`,
        type: 'TEAM_REPORT_SUBMITTED',
        data: { projectId },
      });
    }

    return this.prisma.teamDailyReport.findUnique({
      where: { id: report.id },
      include: { media: true },
    });
  }

  /**
   * Nhân công theo ngày cho tab Thành viên (mockup 20): mọi đội của dự án, từng thợ có mặt/vắng
   * theo ngày được chọn, cộng báo cáo nhân công đã gửi chủ đầu tư hôm đó (nếu có).
   */
  async workforce(projectId: string, userId: string, dateIso?: string) {
    const actor = await this.requireMember(projectId, userId);
    const date = toDateOnly(dateIso ? new Date(dateIso) : new Date());
    const leaders = await this.prisma.projectMember.findMany({
      where: { projectId, role: 'SUB_CONTRACTOR', teamType: { not: null } },
      include: {
        user: { select: { id: true, name: true } },
        teamWorkers: { where: { active: true }, include: { attendance: { where: { date } } }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const teams = leaders.map((l) => ({
      memberId: l.id,
      teamType: l.teamType,
      teamTypeLabel: TEAM_TYPE_LABEL[l.teamType as string],
      leader: l.user,
      isMine: l.userId === userId || actor.role === 'MAIN_CONTRACTOR',
      workers: l.teamWorkers.map((w) => ({
        id: w.id,
        name: w.name,
        present: w.attendance[0]?.present ?? null,
        absenceReason: w.attendance[0]?.absenceReason ?? null,
      })),
    }));
    const all = teams.flatMap((t) => t.workers);
    const report = await this.prisma.workforceReport.findUnique({
      where: { projectId_date: { projectId, date } },
      include: { photos: { orderBy: { createdAt: 'asc' } } },
    });
    return {
      date,
      myRole: actor.role,
      present: all.filter((w) => w.present === true).length,
      absent: all.filter((w) => w.present === false).length,
      total: all.length,
      teams,
      report: report && {
        sentAt: report.sentAt,
        presentCount: report.presentCount,
        totalCount: report.totalCount,
        photos: report.photos.map((p) => ({ id: p.id, objectKey: p.objectKey, createdAt: p.createdAt })),
      },
    };
  }

  /**
   * Gửi báo cáo nhân công hôm nay cho chủ đầu tư (mockup 21) — bắt buộc ≥1 ảnh tại công trình.
   * Thầu chính hoặc đội trưởng gửi; tự động báo Telegram + push cho chủ nhà.
   */
  async sendWorkforceReport(projectId: string, userId: string, files: { originalname: string; mimetype: string; buffer: Buffer }[]) {
    const member = await this.requireMember(projectId, userId);
    if (member.role !== 'MAIN_CONTRACTOR' && member.role !== 'SUB_CONTRACTOR') {
      throw new ForbiddenException('Chỉ nhà thầu/đội trưởng gửi báo cáo nhân công');
    }
    if (!files?.length) throw new BadRequestException('Bắt buộc ít nhất 1 ảnh tại công trình');
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException();
    if (!project.driveAccountId) {
      throw new BadRequestException('Công trình chưa liên kết tài khoản Google Drive, chủ nhà cần chọn tài khoản lưu trữ trước');
    }

    // Upload trước, ghi DB sau — Drive lỗi thì không để lại báo cáo không có ảnh.
    const keys: string[] = [];
    for (const file of files) {
      const uploaded = await this.driveStorage.uploadToProjectPhase(
        project.driveAccountId,
        project.name,
        'Nhân công',
        file.originalname || `nhan-cong-${Date.now()}.jpg`,
        file.mimetype,
        file.buffer,
      );
      keys.push(uploaded.fileId);
    }

    const date = toDateOnly(new Date());
    const counts = await this.workforce(projectId, userId);
    const report = await this.prisma.workforceReport.upsert({
      where: { projectId_date: { projectId, date } },
      create: { projectId, date, sentById: userId, presentCount: counts.present, totalCount: counts.total },
      update: { sentById: userId, sentAt: new Date(), presentCount: counts.present, totalCount: counts.total },
    });
    await this.prisma.workforceReportPhoto.createMany({ data: keys.map((objectKey) => ({ reportId: report.id, objectKey })) });

    const owner = await this.prisma.projectMember.findFirst({ where: { projectId, role: 'OWNER' } });
    if (owner) {
      await this.notifications.notifyUser(owner.userId, {
        title: 'Báo cáo nhân công hôm nay',
        body: `${project.name}: ${counts.present}/${counts.total} người có mặt, kèm ${keys.length} ảnh tại công trình.`,
        type: 'WORKFORCE_REPORT',
        data: { projectId },
      });
    }
    return this.workforce(projectId, userId);
  }
}
