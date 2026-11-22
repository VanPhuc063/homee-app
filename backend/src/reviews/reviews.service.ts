import { BadRequestException, Injectable } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';

/**
 * Chủ nhà đánh giá 1 chiều từng thành viên sau khi dự án DONE — 1 lần/thành viên/dự án, không sửa
 * lại (giống Grab/Shopee). Điểm TB + số dự án hoàn thành hiển thị ở hồ sơ công khai (DirectoryService),
 * còn nhận xét (comment) chỉ chính người được đánh giá thấy qua `myReviews`, không công khai.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private prisma: PrismaService,
    private projects: ProjectsService,
    private notifications: NotificationsService,
  ) {}

  async create(
    projectId: string,
    reviewerId: string,
    dto: { revieweeId: string; rating: number; comment?: string },
  ) {
    await this.projects.requireMember(projectId, reviewerId, ['OWNER']);
    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    if (project.status !== 'DONE') {
      throw new BadRequestException('Chỉ đánh giá được sau khi dự án đã hoàn thành');
    }
    const reviewee = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: dto.revieweeId } },
    });
    if (!reviewee || reviewee.role === 'OWNER') {
      throw new BadRequestException('Không tìm thấy thành viên này trong dự án');
    }
    let review;
    try {
      review = await this.prisma.review.create({
        data: {
          projectId,
          revieweeId: dto.revieweeId,
          reviewerId,
          rating: dto.rating,
          comment: dto.comment,
        },
      });
    } catch {
      throw new BadRequestException('Đã đánh giá thành viên này rồi');
    }
    // Tách khỏi try/catch phía trên — nếu notifyUser lỗi vì lý do khác thì không được nhầm thành
    // lỗi "đã đánh giá rồi" (review đã lưu thành công).
    await this.notifications.notifyUser(dto.revieweeId, {
      title: 'Bạn vừa được đánh giá',
      body: `Chủ nhà đã đánh giá bạn sau dự án "${project.name}". Xem trong Hồ sơ.`,
      type: 'REVIEW_RECEIVED',
    });
    return review;
  }

  async listForProject(projectId: string, userId: string) {
    await this.projects.requireMember(projectId, userId, ['OWNER']);
    return this.prisma.review.findMany({
      where: { projectId },
      include: { reviewee: { select: { id: true, name: true } } },
    });
  }

  myReviews(userId: string) {
    return this.prisma.review.findMany({
      where: { revieweeId: userId },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
