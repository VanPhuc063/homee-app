import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AffiliateService } from '../affiliate/affiliate.service';
import { PrismaService } from '../prisma/prisma.service';
import { sendOtp } from './otp-sender';

const OTP_TTL_MS = 5 * 60 * 1000;
const PASSWORD_SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private affiliate: AffiliateService,
  ) {}

  async requestOtp(phone: string, name?: string, referralCode?: string) {
    const devMode = process.env.OTP_DEV_MODE === 'true';
    const code = devMode ? '000000' : Math.floor(100000 + Math.random() * 900000).toString();

    // User mới cần referralCode ngay lúc tạo (cột NOT NULL + unique) — sinh trước upsert vì
    // Prisma không tự generate được giá trị động trong create data của upsert.
    const referralCodeForNewUser = await this.affiliate.generateReferralCode();
    const user = await this.prisma.user.upsert({
      where: { phone },
      update: { otpCode: code, otpExpiresAt: new Date(Date.now() + OTP_TTL_MS) },
      create: {
        phone,
        name: name ?? phone,
        otpCode: code,
        otpExpiresAt: new Date(Date.now() + OTP_TTL_MS),
        referralCode: referralCodeForNewUser,
      },
    });
    // maybeAttachReferral tự bỏ qua nếu user đã có referredById từ trước — gọi lại nhiều lần an
    // toàn, không cần phân biệt đây là user mới tạo hay user cũ gọi lại OTP.
    await this.affiliate.maybeAttachReferral(user.id, referralCode);

    if (devMode) {
      // eslint-disable-next-line no-console
      console.log(`[DEV] OTP for ${phone}: ${code}`);
      return { sent: true, channel: null };
    }
    const channel = await sendOtp(phone, code);
    if (!channel) throw new BadRequestException('Không gửi được mã OTP, thử lại sau hoặc đăng nhập bằng email');
    return { sent: true, channel };
  }

  async verifyOtp(phone: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (
      !user ||
      !user.otpCode ||
      user.otpCode !== code ||
      !user.otpExpiresAt ||
      user.otpExpiresAt < new Date()
    ) {
      throw new UnauthorizedException('OTP không đúng hoặc đã hết hạn');
    }
    const tokens = await this.issueTokens(user.id, user.phone);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        otpCode: null,
        otpExpiresAt: null,
        refreshTokenHash: await bcrypt.hash(tokens.refreshToken, 10),
      },
    });
    return { user: { id: user.id, phone: user.phone, name: user.name }, ...tokens };
  }

  /**
   * Đăng ký bằng Email + Mật khẩu (luồng chính theo mockup) — cùng tồn tại song song với SĐT+OTP
   * (`requestOtp`/`verifyOtp` ở trên, giữ nguyên không đổi) làm lối vào thay thế. Không gửi email
   * xác nhận — codebase hiện chưa có hạ tầng gửi mail (cùng tình trạng với SMS OTP, xem TODO ở
   * `requestOtp`), nên đăng ký xong đăng nhập được ngay, giống hành vi OTP devMode.
   */
  async register(dto: { name: string; email: string; password: string; referralCode?: string }) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing?.passwordHash) throw new BadRequestException('Email này đã được đăng ký, hãy đăng nhập');

    const passwordHash = await bcrypt.hash(dto.password, PASSWORD_SALT_ROUNDS);
    // existing không có mật khẩu = được mời vào dự án bằng email trước khi đăng ký (ProjectsService.addMember).
    const user = existing
      ? await this.prisma.user.update({ where: { id: existing.id }, data: { name: dto.name.trim(), passwordHash } })
      : await this.prisma.user.create({
          data: {
            name: dto.name.trim(),
            email,
            passwordHash,
            referralCode: await this.affiliate.generateReferralCode(),
          },
        });
    await this.affiliate.maybeAttachReferral(user.id, dto.referralCode);

    const tokens = await this.issueTokens(user.id, user.phone);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: await bcrypt.hash(tokens.refreshToken, PASSWORD_SALT_ROUNDS) },
    });
    return { user: { id: user.id, name: user.name, email: user.email, phone: user.phone }, ...tokens };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }
    const tokens = await this.issueTokens(user.id, user.phone);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: await bcrypt.hash(tokens.refreshToken, PASSWORD_SALT_ROUNDS) },
    });
    return { user: { id: user.id, name: user.name, email: user.email, phone: user.phone }, ...tokens };
  }

  async refresh(userId: string, refreshToken: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.refreshTokenHash || !(await bcrypt.compare(refreshToken, user.refreshTokenHash))) {
      throw new UnauthorizedException();
    }
    const tokens = await this.issueTokens(user.id, user.phone);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: await bcrypt.hash(tokens.refreshToken, 10) },
    });
    return tokens;
  }

  private async issueTokens(sub: string, phone: string | null) {
    const accessToken = await this.jwt.signAsync({ sub, phone: phone ?? undefined });
    const refreshToken = await this.jwt.signAsync(
      { sub, typ: 'refresh' },
      { secret: process.env.JWT_REFRESH_SECRET, expiresIn: '30d' },
    );
    return { accessToken, refreshToken };
  }

  async verifyRefreshToken(token: string): Promise<{ sub: string }> {
    try {
      return await this.jwt.verifyAsync(token, { secret: process.env.JWT_REFRESH_SECRET });
    } catch {
      throw new UnauthorizedException();
    }
  }
}
