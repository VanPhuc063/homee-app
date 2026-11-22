import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AdPlacement, SubscriptionPlan, WithdrawalStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { PLAN_CATALOG } from '../subscription/plan-catalog';

/** Admin: rút tiền Affiliate, gói của user, bài viết Thông tin, sản phẩm Shop vật dụng. */
@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // ---------- Rút tiền ----------
  listWithdrawals(status?: WithdrawalStatus) {
    return this.prisma.withdrawal.findMany({
      where: status ? { status } : {},
      include: { user: { select: { id: true, name: true, phone: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /** PENDING → PROCESSING → COMPLETED; PENDING/PROCESSING → REJECTED (trả lại số dư). */
  async setWithdrawalStatus(id: string, status: WithdrawalStatus) {
    const w = await this.prisma.withdrawal.findUnique({ where: { id } });
    if (!w) throw new NotFoundException();
    const allowed: Record<WithdrawalStatus, WithdrawalStatus[]> = {
      PENDING: ['PROCESSING', 'COMPLETED', 'REJECTED'],
      PROCESSING: ['COMPLETED', 'REJECTED'],
      COMPLETED: [],
      REJECTED: [],
    };
    if (!allowed[w.status].includes(status)) {
      throw new BadRequestException(`Không đổi được từ ${w.status} sang ${status}`);
    }
    const updated = await this.prisma.withdrawal.update({ where: { id }, data: { status } });
    const amount = Number(w.amount).toLocaleString('vi-VN');
    const msg: Partial<Record<WithdrawalStatus, [string, string]>> = {
      PROCESSING: ['Đang xử lý rút tiền', `Yêu cầu rút ${amount}đ đang được xử lý.`],
      COMPLETED: ['Đã chuyển tiền', `${amount}đ đã được chuyển vào tài khoản ${w.bankName} của bạn.`],
      REJECTED: ['Yêu cầu rút tiền bị từ chối', `Yêu cầu rút ${amount}đ bị từ chối, số tiền đã được hoàn lại số dư.`],
    };
    if (msg[status]) {
      await this.notifications.notifyUser(w.userId, { title: msg[status]![0], body: msg[status]![1], type: 'WITHDRAWAL_UPDATED' });
    }
    return updated;
  }

  // ---------- Gói của user ----------
  async findUsers(q: string) {
    const s = q.trim();
    if (!s) return [];
    return this.prisma.user.findMany({
      where: {
        OR: [
          { phone: { contains: s } },
          { email: { contains: s, mode: 'insensitive' } },
          { name: { contains: s, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        createdAt: true,
        subscriptions: { orderBy: { createdAt: 'desc' } },
      },
      take: 20,
    });
  }

  /** Tặng/gia hạn gói tay (khuyến mãi, bù lỗi thanh toán...). Không tính hoa hồng affiliate. */
  async grantSubscription(userId: string, plan: SubscriptionPlan, days?: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Không tìm thấy user');
    const def = PLAN_CATALOG[plan];
    if (!def) throw new BadRequestException('Gói không hợp lệ');
    const durationDays = days ?? def.durationDays;
    return this.prisma.subscription.create({
      data: {
        userId,
        plan,
        // Gói tặng tay không đi qua store — ghi APPLE cho đủ cột bắt buộc, phân biệt bằng transactionId.
        store: 'APPLE',
        productId: def.productId,
        transactionId: `admin-grant-${Date.now()}-${userId.slice(0, 8)}`,
        expiresAt: durationDays ? new Date(Date.now() + durationDays * 864e5) : null,
      },
    });
  }

  /** Huỷ gói (VD user được store hoàn tiền) — hết hiệu lực ngay. */
  async cancelSubscription(id: string) {
    const sub = await this.prisma.subscription.findUnique({ where: { id } });
    if (!sub) throw new NotFoundException();
    return this.prisma.subscription.update({ where: { id }, data: { status: 'CANCELLED', expiresAt: new Date() } });
  }

  // ---------- Bài viết Thông tin ----------
  listTips() {
    return this.prisma.tip.findMany({ orderBy: { createdAt: 'desc' } });
  }

  saveTip(id: string | null, dto: TipInput) {
    const data = {
      title: dto.title.trim(),
      body: dto.body.trim(),
      category: dto.category || null,
      emoji: dto.emoji || null,
      readMinutes: dto.readMinutes ?? null,
      phaseCode: dto.phaseCode || null,
      linkUrl: dto.linkUrl || null,
    };
    return id ? this.prisma.tip.update({ where: { id }, data }) : this.prisma.tip.create({ data });
  }

  deleteTip(id: string) {
    return this.prisma.tip.delete({ where: { id } });
  }

  // ---------- Sản phẩm Shop vật dụng ----------
  listProducts() {
    return this.prisma.product.findMany({
      include: { offers: { include: { supplier: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Mỗi sản phẩm 1 link Shopee (mockup 25) — tạo/cập nhật offer của nhà cung cấp Shopee. */
  async saveProduct(id: string | null, dto: ProductInput) {
    const data = {
      name: dto.name.trim(),
      category: dto.category.trim(),
      description: dto.description || null,
      emoji: dto.emoji || null,
      originalPrice: dto.originalPrice ?? null,
    };
    const product = id
      ? await this.prisma.product.update({ where: { id }, data })
      : await this.prisma.product.create({ data });
    const shopee =
      (await this.prisma.supplier.findFirst({ where: { name: 'Shopee' } })) ??
      (await this.prisma.supplier.create({ data: { name: 'Shopee', isMarketplace: true } }));
    await this.prisma.productOffer.upsert({
      where: { productId_supplierId: { productId: product.id, supplierId: shopee.id } },
      create: { productId: product.id, supplierId: shopee.id, price: dto.price, affiliateUrl: dto.affiliateUrl || null },
      update: { price: dto.price, affiliateUrl: dto.affiliateUrl || null },
    });
    return product;
  }

  /** Sản phẩm đã có đề xuất vật tư tham chiếu thì DB chặn xoá — báo rõ. */
  async deleteProduct(id: string) {
    try {
      return await this.prisma.product.delete({ where: { id } });
    } catch {
      throw new BadRequestException('Sản phẩm đang được dùng trong đề xuất vật tư, không xoá được');
    }
  }

  listAds() {
    return this.prisma.ad.findMany({ orderBy: { startsAt: 'desc' } });
  }

  async saveAd(id: string | null, dto: AdInput) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu');
    const data = {
      title: dto.title.trim(),
      imageUrl: dto.imageUrl,
      linkUrl: dto.linkUrl || null,
      placement: dto.placement,
      startsAt,
      endsAt,
      active: dto.active ?? true,
    };
    return id ? this.prisma.ad.update({ where: { id }, data }) : this.prisma.ad.create({ data });
  }

  deleteAd(id: string) {
    return this.prisma.ad.delete({ where: { id } });
  }
}

export interface AdInput {
  title: string;
  imageUrl: string;
  linkUrl?: string;
  placement: AdPlacement;
  startsAt: string;
  endsAt: string;
  active?: boolean;
}

export interface TipInput {
  title: string;
  body: string;
  category?: string;
  emoji?: string;
  readMinutes?: number;
  phaseCode?: string;
  linkUrl?: string;
}

export interface ProductInput {
  name: string;
  category: string;
  description?: string;
  emoji?: string;
  price: number;
  originalPrice?: number;
  affiliateUrl?: string;
}
