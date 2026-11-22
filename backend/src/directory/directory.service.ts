import { Injectable, NotFoundException } from '@nestjs/common';
import { ProjectRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Tab Khám phá — chủ nhà chưa quen thầu/giám sát cụ thể nào thì duyệt danh sách người đã tự bật
 * "Sẵn sàng nhận việc" (opt-in, xem MeController.updateProfessionalProfile). Hồ sơ công khai CHỈ lộ
 * số liệu tổng hợp (điểm đánh giá TB, số dự án đã hoàn thành theo vai trò) — không lộ tên/địa chỉ
 * công trình cụ thể hay SĐT, tránh lộ thông tin của các chủ nhà cũ và người lạ.
 */
@Injectable()
export class DirectoryService {
  constructor(private prisma: PrismaService) {}

  private async statsFor(userId: string) {
    const [ratingAgg, completedByRole] = await Promise.all([
      this.prisma.review.aggregate({
        where: { revieweeId: userId },
        _avg: { rating: true },
        _count: { rating: true },
      }),
      this.prisma.projectMember.groupBy({
        by: ['role'],
        where: { userId, role: { not: 'OWNER' }, project: { status: 'DONE' } },
        _count: { _all: true },
      }),
    ]);
    return {
      avgRating: ratingAgg._avg.rating ? Number(ratingAgg._avg.rating.toFixed(1)) : null,
      reviewCount: ratingAgg._count.rating,
      completedProjects: completedByRole.map((r: { role: ProjectRole; _count: { _all: number } }) => ({
        role: r.role,
        count: r._count._all,
      })),
    };
  }

  private candidateSelect() {
    return {
      id: true,
      name: true,
      bio: true,
      serviceArea: true,
      offeredRoles: true,
    } as const;
  }

  async listCandidates(role?: ProjectRole, search?: string) {
    const users = await this.prisma.user.findMany({
      where: {
        availableForHire: true,
        ...(role ? { offeredRoles: { has: role } } : {}),
        ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
      },
      select: this.candidateSelect(),
      orderBy: { createdAt: 'desc' },
    });
    const stats = await Promise.all(users.map((u) => this.statsFor(u.id)));
    return users.map((u, i) => ({ ...u, ...stats[i] }));
  }

  /** viewerId === userId: chính chủ xem/chia sẻ hồ sơ năng lực của mình, không cần bật nhận việc. */
  async getCandidate(userId: string, viewerId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { ...this.candidateSelect(), availableForHire: true },
    });
    if (!user || (!user.availableForHire && viewerId !== userId)) {
      throw new NotFoundException('Không tìm thấy ứng viên này');
    }
    const stats = await this.statsFor(userId);
    return { ...user, ...stats };
  }
}
