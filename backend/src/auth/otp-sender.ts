import { Logger } from '@nestjs/common';

const logger = new Logger('OtpSender');

/** 0901234567 / +84901234567 → 84901234567 (định dạng Zalo ZNS và eSMS đều nhận). */
function toE164NoPlus(phone: string): string {
  const p = phone.replace(/\D/g, '');
  return p.startsWith('0') ? `84${p.slice(1)}` : p;
}

/**
 * Gửi OTP qua Zalo ZNS (Zalo Notification Service). Cần OA đã duyệt + template OTP:
 * ZALO_OA_ACCESS_TOKEN, ZALO_ZNS_OTP_TEMPLATE_ID (template có 1 tham số `otp`).
 * Docs: https://developers.zalo.me/docs/zalo-notification-service
 */
async function sendZalo(phone: string, code: string): Promise<boolean> {
  const token = process.env.ZALO_OA_ACCESS_TOKEN;
  const templateId = process.env.ZALO_ZNS_OTP_TEMPLATE_ID;
  if (!token || !templateId) return false;
  try {
    const res = await fetch('https://business.openapi.zalo.me/message/template', {
      method: 'POST',
      headers: { access_token: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: toE164NoPlus(phone),
        template_id: templateId,
        template_data: { otp: code },
        tracking_id: `otp-${Date.now()}`,
      }),
    });
    const data = (await res.json()) as { error?: number; message?: string };
    if (data.error === 0) return true;
    // Số chưa dùng Zalo, hết quota... → để SMS gửi thay.
    logger.warn(`Zalo ZNS lỗi ${data.error}: ${data.message}`);
    return false;
  } catch (e) {
    logger.warn(`Zalo ZNS lỗi: ${(e as Error).message}`);
    return false;
  }
}

/**
 * SMS dự phòng qua eSMS.vn (brandname). Cần ESMS_API_KEY, ESMS_SECRET_KEY, ESMS_BRANDNAME.
 * Docs: https://esms.vn/eSMS-API-Documents
 */
async function sendSms(phone: string, code: string): Promise<boolean> {
  const apiKey = process.env.ESMS_API_KEY;
  const secret = process.env.ESMS_SECRET_KEY;
  const brand = process.env.ESMS_BRANDNAME;
  if (!apiKey || !secret || !brand) return false;
  try {
    const res = await fetch('https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ApiKey: apiKey,
        SecretKey: secret,
        Brandname: brand,
        SmsType: '2',
        Phone: phone,
        Content: `${code} la ma xac thuc Nhat Ky Thi Cong cua ban. Ma co hieu luc 5 phut.`,
        IsUnicode: '0',
      }),
    });
    const data = (await res.json()) as { CodeResult?: string; ErrorMessage?: string };
    if (data.CodeResult === '100') return true;
    logger.warn(`eSMS lỗi ${data.CodeResult}: ${data.ErrorMessage}`);
    return false;
  } catch (e) {
    logger.warn(`eSMS lỗi: ${(e as Error).message}`);
    return false;
  }
}

/** Ưu tiên Zalo (người dùng VN chủ yếu dùng Zalo), không được thì SMS. Trả kênh đã gửi. */
export async function sendOtp(phone: string, code: string): Promise<'ZALO' | 'SMS' | null> {
  if (await sendZalo(phone, code)) return 'ZALO';
  if (await sendSms(phone, code)) return 'SMS';
  return null;
}
