import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Nhắc thầu (chính lẫn phụ) cập nhật tiến độ hằng ngày lúc 15h giờ VN — chỉ áp dụng khi dự án đã
 * qua PLANNING và đang ACTIVE (đang thi công thật, chưa/không nhắc lúc lập kế hoạch hay đã bàn
 * giao). Chỉ nhắc người CHƯA nộp bằng chứng nào hôm nay cho dự án đó, tránh làm phiền người đã
 * cập nhật rồi trong ngày.
 */
@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  @Cron('0 15 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async remindDailyProgress() {
    const projects = await this.prisma.project.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        members: {
          where: { role: { in: ['MAIN_CONTRACTOR', 'SUB_CONTRACTOR'] } },
          select: { userId: true },
        },
      },
    });

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    let sent = 0;
    for (const project of projects) {
      for (const member of project.members) {
        const uploadedToday = await this.prisma.evidence.findFirst({
          where: {
            uploaderId: member.userId,
            createdAt: { gte: startOfToday },
            step: { phase: { projectId: project.id } },
          },
          select: { id: true },
        });
        if (uploadedToday) continue;

        await this.notifications.notifyUser(member.userId, {
          title: 'Nhắc cập nhật tiến độ',
          body: `Đừng quên cập nhật tiến độ hôm nay cho "${project.name}".`,
          type: 'DAILY_PROGRESS_REMINDER',
          data: { projectId: project.id },
        });
        sent++;
      }
    }
    this.logger.log(`Đã gửi ${sent} nhắc nhở cập nhật tiến độ hằng ngày`);
  }
}
