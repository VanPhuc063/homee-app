import { SubscriptionPlan } from '@prisma/client';

export interface PlanDef {
  /// Product ID đăng ký trên App Store Connect/Google Play Console — PLACEHOLDER, phải đổi lại
  /// đúng ID thật sau khi tạo sản phẩm (xem IAP_SETUP.md).
  productId: string;
  label: string;
  priceVnd: number;
  /// SUBSCRIPTION = auto-renewing thật (chỉ 2 gói theo tháng). ONE_TIME = mua đứt 1 lần, backend
  /// tự cộng hạn dùng — dùng cho các gói 6/9/12 tháng vì Apple KHÔNG hỗ trợ chu kỳ 9 tháng cho
  /// subscription (chỉ 1 tuần/1-2-3-6 tháng/1 năm), nên mọi gói "mua trọn gói N tháng" đều xử lý
  /// nhất quán theo kiểu mua đứt thay vì tách riêng cái nào subscription được cái nào không.
  kind: 'SUBSCRIPTION' | 'ONE_TIME';
  /// null = vĩnh viễn (AI Premium mua 1 lần).
  durationDays: number | null;
  audience: 'OWNER' | 'CONTRACTOR' | 'ADDON';
  /// Nhãn nổi bật tuỳ chọn hiện trên thẻ gói (mobile) — thuần marketing, không ảnh hưởng logic.
  badge?: 'POPULAR' | 'BEST';
}

export const PLAN_CATALOG: Record<SubscriptionPlan, PlanDef> = {
  OWNER_MONTHLY: {
    productId: 'com.homee.owner.monthly',
    label: 'Chủ nhà — Theo tháng',
    priceVnd: 500_000,
    kind: 'SUBSCRIPTION',
    durationDays: 30,
    audience: 'OWNER',
  },
  OWNER_6MONTH: {
    productId: 'com.homee.owner.6month',
    label: 'Chủ nhà — 6 tháng',
    priceVnd: 2_800_000,
    kind: 'ONE_TIME',
    durationDays: 182,
    audience: 'OWNER',
    badge: 'POPULAR',
  },
  OWNER_9MONTH: {
    productId: 'com.homee.owner.9month',
    label: 'Chủ nhà — 9 tháng',
    priceVnd: 4_000_000,
    kind: 'ONE_TIME',
    durationDays: 274,
    audience: 'OWNER',
  },
  OWNER_12MONTH: {
    productId: 'com.homee.owner.12month',
    label: 'Chủ nhà — 12 tháng',
    // Hạ từ 5.5M (review 10.6): gói dài hơn phải rẻ hơn/tháng — 12 tháng ~417K < 9 tháng ~444K.
    priceVnd: 5_000_000,
    kind: 'ONE_TIME',
    durationDays: 365,
    audience: 'OWNER',
  },
  CONTRACTOR_MONTHLY: {
    productId: 'com.homee.contractor.monthly',
    label: 'Nhà thầu — Theo tháng (1 dự án)',
    priceVnd: 500_000,
    kind: 'SUBSCRIPTION',
    durationDays: 30,
    audience: 'CONTRACTOR',
  },
  CONTRACTOR_10PROJECTS: {
    productId: 'com.homee.contractor.10projects',
    label: 'Nhà thầu — Gói 10 dự án',
    priceVnd: 3_000_000,
    kind: 'ONE_TIME',
    // Review 10.6: gói 10 dự án cần thời hạn — tạo được tối đa 10 dự án trong 12 tháng.
    durationDays: 365,
    audience: 'CONTRACTOR',
    badge: 'BEST',
  },
  CONTRACTOR_YEARLY: {
    productId: 'com.homee.contractor.yearly',
    label: 'Nhà thầu — Gói năm (không giới hạn dự án)',
    priceVnd: 10_000_000,
    kind: 'ONE_TIME',
    durationDays: 365,
    audience: 'CONTRACTOR',
  },
  AI_PREMIUM: {
    productId: 'com.homee.ai.premium',
    label: 'AI Premium (mua 1 lần, dùng vĩnh viễn)',
    priceVnd: 700_000,
    kind: 'ONE_TIME',
    durationDays: null,
    audience: 'ADDON',
  },
};

export function planByProductId(productId: string): { plan: SubscriptionPlan; def: PlanDef } | null {
  const entry = (Object.entries(PLAN_CATALOG) as [SubscriptionPlan, PlanDef][]).find(
    ([, d]) => d.productId === productId,
  );
  return entry ? { plan: entry[0], def: entry[1] } : null;
}
