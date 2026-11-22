import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ProjectRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Đội thợ/thầu phụ quen thuộc của 1 user (thường là thầu chính) — danh bạ cá nhân độc lập với dự
 * án cụ thể, tái sử dụng khi mời vào bất kỳ dự án nào họ làm thầu chính (xem
 * ProjectsService.assertCanInvite gọi `autoSave` sau khi mời thầu phụ thành công).
 */
@Injectable()
export class CrewService {
  constructor(private prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.crewMember.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  add(userId: string, dto: { phone: string; name: string; defaultRole?: ProjectRole }) {
    return this.prisma.crewMember.upsert({
      where: { ownerId_phone: { ownerId: userId, phone: dto.phone } },
      update: { name: dto.name, defaultRole: dto.defaultRole ?? 'SUB_CONTRACTOR' },
      create: {
        ownerId: userId,
        phone: dto.phone,
        name: dto.name,
        defaultRole: dto.defaultRole ?? 'SUB_CONTRACTOR',
      },
    });
  }

  /** Tự lưu im lặng sau khi mời ai đó làm thầu phụ thành công — không throw nếu trùng, vì đây chỉ
   * là tiện ích phụ, lỗi ở đây không được phép làm hỏng thao tác mời chính. */
  async autoSave(userId: string, dto: { phone: string; name: string; defaultRole: ProjectRole }) {
    try {
      await this.add(userId, dto);
    } catch {
      // bỏ qua — không để lỗi lưu đội thợ ảnh hưởng tới việc mời thành viên đã thành công
    }
  }

  async remove(userId: string, crewId: string) {
    const entry = await this.prisma.crewMember.findUnique({ where: { id: crewId } });
    if (!entry) throw new NotFoundException();
    if (entry.ownerId !== userId) throw new ForbiddenException();
    return this.prisma.crewMember.delete({ where: { id: crewId } });
  }
}
