import { Body, Controller, ForbiddenException, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ProjectRole } from '@prisma/client';
import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard, AuthUser, CurrentUser } from './auth.guard';

class PushTokenDto {
  @IsString() pushToken: string;
}

class UpdateProfileDto {
  @IsString() @Length(1, 60) name: string;
}

class UpdateProfessionalProfileDto {
  @IsBoolean() availableForHire: boolean;
  @IsArray() @IsEnum(ProjectRole, { each: true }) offeredRoles: ProjectRole[];
  @IsOptional() @IsString() @Length(0, 500) bio?: string;
  @IsOptional() @IsString() @Length(0, 120) serviceArea?: string;
}

@UseGuards(AuthGuard)
@Controller('me')
export class MeController {
  constructor(private prisma: PrismaService) {}

  /** Thầu/giám sát không tự đăng ký "làm nghề" — chỉ mở khoá Hồ sơ hành nghề sau khi đã được 1
   * chủ nhà nào đó gán vào dự án (role khác OWNER) VÀ dự án đó đã hoàn tất (DONE), tức đã có ít
   * nhất 1 track record thật. Chủ nhà thuần tuý (chưa từng làm thầu/giám sát ở đâu) sẽ không thấy
   * mục này — không có lý do gì để họ tự "quảng cáo" bản thân trên Khám phá. */
  private async isEligibleForProfessionalProfile(userId: string): Promise<boolean> {
    const count = await this.prisma.projectMember.count({
      where: { userId, role: { not: 'OWNER' }, project: { status: 'DONE' } },
    });
    return count > 0;
  }

  /** Hồ sơ đầy đủ (kể cả phần hành nghề) — dùng để tự điền lại form Hồ sơ trên mobile. */
  @Get()
  async me(@CurrentUser() user: AuthUser) {
    const [u, eligible] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: user.sub },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          availableForHire: true,
          offeredRoles: true,
          bio: true,
          serviceArea: true,
          telegramChatId: true,
        },
      }),
      this.isEligibleForProfessionalProfile(user.sub),
    ]);
    return { ...u, eligibleForProfessionalProfile: eligible };
  }

  /** Lưu Expo push token của thiết bị hiện tại — gọi lại sau mỗi lần đăng nhập. */
  @Post('push-token')
  setPushToken(@CurrentUser() user: AuthUser, @Body() dto: PushTokenDto) {
    return this.prisma.user.update({
      where: { id: user.sub },
      data: { pushToken: dto.pushToken },
      select: { id: true },
    });
  }

  /** Đổi tên hiển thị — join trực tiếp ở mọi nơi (ProjectMember, Evidence, Comment...) nên đổi
   * 1 lần là cập nhật khắp nơi ngay, không cần đồng bộ snapshot. */
  @Patch('profile')
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id: user.sub },
      data: { name: dto.name.trim() },
      select: { id: true, name: true, phone: true },
    });
  }

  /** Bật/tắt hiện diện ở tab Khám phá + thông tin hồ sơ hành nghề (vai trò nhận việc, giới
   * thiệu, khu vực) — opt-in, mặc định availableForHire=false lúc tạo tài khoản. */
  @Patch('professional-profile')
  async updateProfessionalProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProfessionalProfileDto,
  ) {
    if (!(await this.isEligibleForProfessionalProfile(user.sub))) {
      throw new ForbiddenException(
        'Chỉ mở khoá hồ sơ hành nghề sau khi đã hoàn tất ít nhất 1 dự án với vai trò thầu/giám sát',
      );
    }
    return this.prisma.user.update({
      where: { id: user.sub },
      data: {
        availableForHire: dto.availableForHire,
        offeredRoles: dto.offeredRoles,
        bio: dto.bio?.trim() || null,
        serviceArea: dto.serviceArea?.trim() || null,
      },
      select: {
        id: true,
        availableForHire: true,
        offeredRoles: true,
        bio: true,
        serviceArea: true,
      },
    });
  }
}
