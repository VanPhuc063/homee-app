import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const MIN_WITHDRAWAL_VND = 500_000;
// Flat 1 tầng: chỉ người giới thiệu TRỰC TIẾP nhận hoa hồng, không chia nhiều tầng như kiểu
// founder/sale trước đây — đơn giản hoá theo đúng mô hình referral của dự án cashback.
const REFERRAL_RATE = 0.1;
const REFERRAL_CODE_LENGTH = 8;

/**
 * Affiliate flat 1 tầng, mọi user đều có mã giới thiệu riêng ngay từ lúc tạo tài khoản — không có
 * khái niệm "founder"/CTV cần đăng ký-duyệt. Gắn người giới thiệu 1 LẦN DUY NHẤT lúc tạo tài khoản
 * (nhập mã giới thiệu ở màn đăng nhập), áp dụng cho mọi giao dịch sau này của user đó suốt đời dùng
 * app. Cùng tinh thần với referral của dự án cashback (User.referralCode + User.referredById) nhưng
 * chỉ 1 tầng thay vì 3 tầng.
 */
@Injectable()
export class AffiliateService {
  constructor(private prisma: PrismaService) {}

  /** Sinh mã giới thiệu ngẫu nhiên, không trùng — gọi lúc tạo tài khoản mới (xem AuthService). */
  async generateReferralCode(): Promise<string> {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789'; // bỏ ký tự dễ nhầm (l/1, i, o/0)
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let code = '';
      for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
      const clash = await this.prisma.user.findUnique({ where: { referralCode: code } });
      if (!clash) return code;
    }
  }

  /** Gọi từ AuthService.requestOtp lúc tạo tài khoản mới — im lặng bỏ qua nếu mã sai/không có,
   * không được chặn đăng ký chỉ vì gõ sai mã giới thiệu. Idempotent: chỉ gắn nếu user chưa có
   * referredById từ trước. */
  async maybeAttachReferral(userId: string, rawCode?: string) {
    if (!rawCode?.trim()) return;
    const code = rawCode.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.referredById) return;
    const referrer = await this.prisma.user.findUnique({ where: { referralCode: code } });
    if (!referrer || referrer.id === userId) return;
    await this.prisma.user.update({ where: { id: userId }, data: { referredById: referrer.id } });
  }

  async getMyReferralInfo(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException();

    const [referrals, commissions, withdrawn] = await Promise.all([
      this.prisma.user.findMany({
        where: { referredById: userId },
        select: { id: true, name: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.commission.findMany({
        where: { beneficiaryUserId: userId },
        orderBy: { createdAt: 'desc' },
        include: { sourceUser: { select: { name: true } } },
      }),
      this.prisma.withdrawal.aggregate({
        where: { userId, status: { in: ['PENDING', 'PROCESSING', 'COMPLETED'] } }, // PENDING cũng giữ tiền, chống gửi trùng nhiều yêu cầu
        _sum: { amount: true },
      }),
    ]);

    const earningsByUser = new Map<string, number>();
    for (const c of commissions) {
      earningsByUser.set(c.sourceUserId, (earningsByUser.get(c.sourceUserId) ?? 0) + Number(c.amount));
    }
    const totalCommission = commissions.reduce((sum, c) => sum + Number(c.amount), 0);
    const withdrawable = Math.max(0, totalCommission - Number(withdrawn._sum.amount ?? 0));

    return {
      referralCode: user.referralCode,
      totalReferrals: referrals.length,
      totalCommission,
      withdrawable,
      referrals: referrals.map((r) => ({
        id: r.id,
        name: r.name,
        joinedAt: r.createdAt,
        earnings: earningsByUser.get(r.id) ?? 0,
      })),
      recentCommissions: commissions.slice(0, 20).map((c) => ({
        id: c.id,
        customerName: c.sourceUser.name,
        amount: Number(c.amount),
        createdAt: c.createdAt,
      })),
    };
  }

  /** Gọi từ SubscriptionService ngay sau khi xác thực giao dịch mua thành công — im lặng bỏ qua
   * nếu user mua không có ai giới thiệu (organic, không ai nhận commission). */
  async recordCommission(userId: string, subscriptionId: string, amountVnd: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.referredById) return;
    const amount = Math.round(amountVnd * REFERRAL_RATE);
    if (amount <= 0) return;
    await this.prisma.commission.create({
      data: {
        subscriptionId,
        beneficiaryUserId: user.referredById,
        sourceUserId: userId,
        amount,
      },
    });
  }

  async requestWithdrawal(
    userId: string,
    dto: { amount: number; bankName: string; bankAccount: string; accountHolder?: string },
  ) {
    if (dto.amount < MIN_WITHDRAWAL_VND) {
      throw new BadRequestException(`Số tiền rút tối thiểu ${MIN_WITHDRAWAL_VND.toLocaleString('vi-VN')}đ`);
    }
    if (!dto.bankName?.trim() || !dto.bankAccount?.trim()) {
      throw new BadRequestException('Cần nhập tên ngân hàng và số tài khoản');
    }
    const { withdrawable } = await this.getMyReferralInfo(userId);
    if (dto.amount > withdrawable) {
      throw new BadRequestException('Số tiền rút vượt quá số dư có thể rút');
    }
    return this.prisma.withdrawal.create({
      data: {
        userId,
        amount: dto.amount,
        bankName: dto.bankName.trim(),
        bankAccount: dto.bankAccount.trim(),
        accountHolder: dto.accountHolder?.trim() || undefined,
      },
    });
  }

  async listMyWithdrawals(userId: string) {
    return this.prisma.withdrawal.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }
}
