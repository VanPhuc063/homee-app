import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { AffiliateService } from '../affiliate/affiliate.service';
import { PrismaService } from '../prisma/prisma.service';
import { PLAN_CATALOG, planByProductId } from './plan-catalog';

const APPLE_PROD_URL = 'https://api.storekit.itunes.apple.com/inApps/v1/transactions';
const APPLE_SANDBOX_URL = 'https://api.storekit-sandbox.itunes.apple.com/inApps/v1/transactions';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_API_BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';

/**
 * Subscription qua IAP (App Store/Google Play) — KHÔNG dùng SePay/VietQR vì app phân phối qua App
 * Store/Play Store, Apple/Google bắt buộc digital goods phải qua IAP của họ, không được bypass
 * bằng payment gateway ngoài (rủi ro bị từ chối/gỡ app).
 *
 * `verifyWithApple`/`verifyWithGoogle` viết đúng theo tài liệu chính thức (App Store Server API v2,
 * Google Play Developer API) nhưng CHƯA TEST được với credential/giao dịch thật — cần tạo sản phẩm
 * trên App Store Connect + Google Play Console trước (xem IAP_SETUP.md), set env tương ứng, rồi
 * thử 1 giao dịch sandbox thật để xác nhận field response đúng như kỳ vọng trước khi tin tưởng
 * tuyệt đối logic này ở production.
 */
@Injectable()
export class SubscriptionService {
  private logger = new Logger(SubscriptionService.name);

  constructor(
    private prisma: PrismaService,
    private affiliate: AffiliateService,
  ) {}

  async getStatus(userId: string) {
    const subs = await this.prisma.subscription.findMany({
      where: { userId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
    const now = new Date();
    const active = subs.filter((s) => !s.expiresAt || s.expiresAt > now);
    const plan = active.find((s) => PLAN_CATALOG[s.plan].audience !== 'ADDON') ?? null;
    const aiPremium = active.some((s) => s.plan === 'AI_PREMIUM');
    return {
      plan: plan
        ? {
            plan: plan.plan,
            label: PLAN_CATALOG[plan.plan].label,
            expiresAt: plan.expiresAt,
            isAutoRenewing: plan.isAutoRenewing,
          }
        : null,
      aiPremium,
    };
  }

  /** Mobile gọi sau khi IAP báo mua thành công (purchaseUpdatedListener) — backend xác thực lại
   * với Apple/Google trước khi ghi nhận, không bao giờ tin trực tiếp dữ liệu client gửi lên. */
  async verifyPurchase(
    userId: string,
    dto: { platform: 'ios' | 'android'; productId: string; transactionId: string; purchaseToken?: string },
  ) {
    const found = planByProductId(dto.productId);
    if (!found) throw new BadRequestException('Sản phẩm không hợp lệ');
    const { plan, def } = found;

    // Đã xác thực giao dịch này trước đó (VD app gọi lại do mất mạng giữa chừng) — khỏi gọi lại
    // store, trả thẳng trạng thái hiện tại.
    const existing = await this.prisma.subscription.findUnique({
      where: { transactionId: dto.transactionId },
    });
    if (existing) return this.getStatus(userId);

    if (dto.platform === 'ios') {
      await this.verifyWithApple(dto.transactionId, def.productId);
    } else {
      if (!dto.purchaseToken) throw new BadRequestException('Thiếu purchaseToken');
      await this.verifyWithGoogle(def.productId, dto.purchaseToken, def.kind === 'SUBSCRIPTION');
    }

    const expiresAt = def.durationDays
      ? new Date(Date.now() + def.durationDays * 24 * 60 * 60 * 1000)
      : null;
    const created = await this.prisma.subscription.create({
      data: {
        userId,
        plan,
        store: dto.platform === 'ios' ? 'APPLE' : 'GOOGLE',
        productId: def.productId,
        isAutoRenewing: def.kind === 'SUBSCRIPTION',
        purchaseToken: dto.purchaseToken,
        transactionId: dto.transactionId,
        expiresAt,
      },
    });
    // Ghi nhận hoa hồng cho founder/sale đã giới thiệu user này (nếu có) — tự bỏ qua nếu mua
    // organic, không ai giới thiệu.
    await this.affiliate.recordCommission(userId, created.id, def.priceVnd);
    return this.getStatus(userId);
  }

  /** App Store Server API v2 — JWT ký ES256 bằng IAP key (.p8) tải từ App Store Connect > Users
   * and Access > Integrations > In-App Purchase. Thử prod trước, 404 thì thử sandbox (đúng cách
   * Apple khuyến nghị — không có cách nào biết trước giao dịch thuộc môi trường nào). */
  private async verifyWithApple(transactionId: string, expectedProductId: string) {
    const keyId = process.env.APPLE_IAP_KEY_ID;
    const issuerId = process.env.APPLE_IAP_ISSUER_ID;
    const privateKey = process.env.APPLE_IAP_PRIVATE_KEY;
    const bundleId = process.env.APPLE_BUNDLE_ID;
    if (!keyId || !issuerId || !privateKey || !bundleId) {
      throw new BadRequestException(
        'Server chưa cấu hình xác thực Apple IAP — cần APPLE_IAP_KEY_ID, APPLE_IAP_ISSUER_ID, APPLE_IAP_PRIVATE_KEY, APPLE_BUNDLE_ID trong .env',
      );
    }
    const token = jwt.sign({}, privateKey.replace(/\\n/g, '\n'), {
      algorithm: 'ES256',
      issuer: issuerId,
      audience: 'appstoreconnect-v1',
      expiresIn: '5m',
      keyid: keyId,
      header: { alg: 'ES256', kid: keyId, typ: 'JWT' },
    });

    let res = await fetch(`${APPLE_PROD_URL}/${transactionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) {
      res = await fetch(`${APPLE_SANDBOX_URL}/${transactionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Apple verify thất bại: ${res.status} ${text}`);
      throw new BadRequestException('Không xác thực được giao dịch với Apple');
    }
    const data = (await res.json()) as { signedTransactionInfo: string };
    // signedTransactionInfo là 1 JWS do Apple ký — chỉ decode lấy payload để đọc field, verify đã
    // xảy ra ở tầng gọi API (chính request trên đã xác thực danh tính server qua JWT ở header).
    const payload = jwt.decode(data.signedTransactionInfo) as {
      productId?: string;
      bundleId?: string;
    } | null;
    if (!payload || payload.productId !== expectedProductId || payload.bundleId !== bundleId) {
      throw new BadRequestException('Giao dịch không khớp sản phẩm/app');
    }
  }

  /** Google Play Developer API — OAuth2 service-account flow (tự ký JWT đổi lấy access token,
   * không cần thư viện googleapis, cùng pattern với GoogleDriveService đã có trong app). Service
   * account lấy từ Google Cloud Console, cấp quyền trong Play Console > Setup > API access. */
  private async verifyWithGoogle(productId: string, purchaseToken: string, isSubscription: boolean) {
    const email = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL;
    const key = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY;
    const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME;
    if (!email || !key || !packageName) {
      throw new BadRequestException(
        'Server chưa cấu hình xác thực Google Play — cần GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL, GOOGLE_PLAY_SERVICE_ACCOUNT_KEY, GOOGLE_PLAY_PACKAGE_NAME trong .env',
      );
    }
    const assertion = jwt.sign(
      {
        iss: email,
        scope: 'https://www.googleapis.com/auth/androidpublisher',
        aud: GOOGLE_TOKEN_URL,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      key.replace(/\\n/g, '\n'),
      { algorithm: 'RS256' },
    );
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      this.logger.error(`Lấy access token Google Play thất bại: ${text}`);
      throw new BadRequestException('Không lấy được access token Google Play');
    }
    const { access_token } = (await tokenRes.json()) as { access_token: string };

    const path = isSubscription
      ? `${GOOGLE_API_BASE}/${packageName}/purchases/subscriptions/${productId}/tokens/${purchaseToken}`
      : `${GOOGLE_API_BASE}/${packageName}/purchases/products/${productId}/tokens/${purchaseToken}`;
    const res = await fetch(path, { headers: { Authorization: `Bearer ${access_token}` } });
    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Google verify thất bại: ${res.status} ${text}`);
      throw new BadRequestException('Không xác thực được giao dịch với Google Play');
    }
    // Chỉ check token có tồn tại/thuộc đúng sản phẩm (HTTP 200) — CHƯA parse sâu purchaseState/
    // paymentState (field khác nhau giữa subscriptions/products API) vì chưa có giao dịch thật để
    // đối chiếu đúng shape response. Nên bổ sung check refunded/expired/paused trước khi phát hành
    // thật — xem IAP_SETUP.md.
  }
}
