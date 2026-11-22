import { useQuery } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import * as SecureStore from '@/storage';
import { useEffect, useState } from 'react';
import { Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '@/api/client';
import { Feather } from '@/components/Feather';
import { colors } from '@/theme';
import type { Ad, Product } from '@/types';

const today = () => new Date().toISOString().slice(0, 10);

/** Mỗi loại quảng cáo hiện tối đa 1 lần/ngày (mockup J). Lưu ngày đã hiện trên máy. */
async function shownToday(key: string) {
  try {
    return (await SecureStore.getItemAsync(`ad.${key}`)) === today();
  } catch {
    return false;
  }
}
async function markShown(key: string) {
  try {
    await SecureStore.setItemAsync(`ad.${key}`, today());
  } catch {
    // Không lưu được thì lần sau hiện lại — chấp nhận được.
  }
}

/**
 * Có hiện quảng cáo không: tắt hết khi đã có gói trả phí hoặc đã mua AI; không quảng cáo với đội
 * trưởng/thầu phụ (người nhập liệu, không phải người mua).
 */
export function useAdsAllowed(myRole?: string) {
  const { data: status } = useQuery({
    queryKey: ['subscription-status'],
    queryFn: () => api<{ plan: unknown | null; aiPremium: boolean }>('/me/subscription'),
  });
  if (!status || myRole === 'SUB_CONTRACTOR') return false;
  return !status.plan && !status.aiPremium;
}

/** Popup overlay AI Premium trên Dashboard (mockup 36) — chỉ khi dự án chưa mở khoá AI. */
export function AiPremiumPopup({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    shownToday('ai-nudge').then((shown) => {
      if (!shown) {
        setVisible(true);
        markShown('ai-nudge');
      }
    });
  }, [enabled]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <View style={styles.backdrop}>
        <View style={styles.popup}>
          <Feather name="zap" size={28} color={colors.ai} />
          <Text style={styles.popupTag}>AI Premium</Text>
          <Text style={styles.popupTitle}>AI kiểm tra báo cáo tự động!</Text>
          <Text style={styles.popupBody}>Phát hiện sai sót, yêu cầu bằng chứng quan trọng, tổng kết 8 PM mỗi ngày</Text>
          <TouchableOpacity
            style={styles.popupBtn}
            onPress={() => {
              setVisible(false);
              router.push('/subscription/ai');
            }}
          >
            <Text style={styles.popupBtnText}>Mở khoá — 700K</Text>
          </TouchableOpacity>
          <Text style={styles.popupFoot}>Trả 1 lần, dùng vĩnh viễn</Text>
          <TouchableOpacity onPress={() => setVisible(false)}>
            <Text style={styles.later}>Để sau</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/** Quảng cáo nhà quảng cáo đang chạy (admin đăng có hẹn ngày, server lọc theo ngày). */
function useAds() {
  return useQuery({ queryKey: ['ads'], queryFn: () => api<Ad[]>('/ads'), staleTime: 10 * 60_000 }).data ?? [];
}

/** Popup quảng cáo — mỗi quảng cáo tối đa 1 lần/ngày, mỗi lần mở app chỉ 1 popup. */
export function AdPopup({ enabled }: { enabled: boolean }) {
  const ads = useAds();
  const [ad, setAd] = useState<Ad | null>(null);

  useEffect(() => {
    if (!enabled || ad) return;
    (async () => {
      for (const a of ads.filter((x) => x.placement === 'POPUP')) {
        if (!(await shownToday(`popup.${a.id}`))) {
          await markShown(`popup.${a.id}`);
          setAd(a);
          return;
        }
      }
    })();
  }, [enabled, ads, ad]);

  if (!ad) return null;
  const close = () => setAd({ ...ad, id: '' });
  return (
    <Modal visible={!!ad.id} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.adPopup}>
          <TouchableOpacity
            activeOpacity={0.9}
            disabled={!ad.linkUrl}
            onPress={() => {
              close();
              Linking.openURL(ad.linkUrl!);
            }}
            accessibilityLabel={ad.title}
          >
            <Image source={{ uri: ad.imageUrl }} style={styles.adPopupImg} resizeMode="cover" />
          </TouchableOpacity>
          <Text style={styles.adLabel}>Quảng cáo · {ad.title}</Text>
          <TouchableOpacity style={styles.adClose} onPress={close} hitSlop={12} accessibilityLabel="Đóng quảng cáo">
            <Feather name="x" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Banner "Tài trợ" xen giữa danh sách báo cáo (mockup 37). Ưu tiên banner nhà quảng cáo đang chạy;
 * không có thì lấy sản phẩm đầu tiên trong Shop vật dụng.
 */
export function SponsoredBanner() {
  const banner = useAds().find((a) => a.placement === 'BANNER');
  const { data } = useQuery({ queryKey: ['products', 'Tất cả', ''], queryFn: () => api<Product[]>('/products') });
  if (banner) {
    return (
      <TouchableOpacity
        style={styles.adBanner}
        activeOpacity={0.85}
        disabled={!banner.linkUrl}
        onPress={() => Linking.openURL(banner.linkUrl!)}
        accessibilityLabel={banner.title}
      >
        <Image source={{ uri: banner.imageUrl }} style={styles.adBannerImg} resizeMode="cover" />
        <Text style={styles.adBannerTag}>Tài trợ</Text>
      </TouchableOpacity>
    );
  }
  const p = data?.find((x) => x.offers.some((o) => o.affiliateUrl));
  const offer = p?.offers.find((o) => o.affiliateUrl);
  if (!p || !offer) return null;
  return (
    <TouchableOpacity style={styles.sponsor} onPress={() => Linking.openURL(offer.affiliateUrl!)} activeOpacity={0.85}>
      <Text style={styles.sponsorTag}>Tài trợ</Text>
      <Text style={styles.sponsorEmoji}>{p.emoji ?? '🛠️'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.sponsorName}>{p.name}</Text>
        {!!p.description && (
          <Text style={styles.sponsorDesc} numberOfLines={1}>
            {p.description}
          </Text>
        )}
        <Text style={styles.sponsorPrice}>
          {Number(offer.price).toLocaleString('vi-VN')}đ <Text style={styles.sponsorShop}>🛒 Shopee</Text>
        </Text>
      </View>
    </TouchableOpacity>
  );
}

/** Banner "Khuyến mãi" gói 6 tháng (mockup 37). */
export function PromoBanner() {
  const router = useRouter();
  return (
    <TouchableOpacity style={styles.promo} onPress={() => router.push('/subscription/owner')} activeOpacity={0.85}>
      <Text style={styles.promoTag}>Khuyến mãi</Text>
      <Feather name="send" size={26} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.promoTitle}>Nâng cấp gói 6 tháng</Text>
        <Text style={styles.promoSub}>Tiết kiệm 200K — chỉ 467K/tháng</Text>
        <Text style={styles.promoLink}>Xem ngay →</Text>
      </View>
    </TouchableOpacity>
  );
}

/** Bottom sheet sau khi gửi báo cáo (mockup 38). Popup và sheet dùng chung mốc ai-nudge: tối đa 1 lần nhắc AI/ngày. */
export function useAfterReportSheet() {
  const [visible, setVisible] = useState(false);
  const maybeShow = async (aiUnlocked: boolean | undefined, allowed: boolean) => {
    if (!allowed || aiUnlocked !== false || (await shownToday('ai-nudge'))) return false;
    await markShown('ai-nudge');
    setVisible(true);
    return true;
  };
  return { visible, setVisible, maybeShow };
}

export function AfterReportSheet({
  visible,
  onClose,
  title,
  subtitle,
  uploaded,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  uploaded: string;
}) {
  const router = useRouter();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheetTop}>
          <Feather name="check-circle" size={36} color={colors.primary} />
          <Text style={styles.sentTitle}>{title}</Text>
          <Text style={styles.sentSub}>{subtitle}</Text>
          <Text style={styles.sentInfo}>{uploaded}</Text>
          <Text style={styles.sentInfo}>Đồng bộ Google Drive ✓</Text>
        </View>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>✨ Báo cáo này đủ chuẩn chưa?</Text>
          <Text style={styles.sheetBody}>
            AI sẽ kiểm tra ảnh, phát hiện sai sót, và yêu cầu bổ sung bằng chứng quan trọng trước khi gửi cho giám sát
          </Text>
          <View style={styles.sheetList}>
            {[
              '✅ Kiểm tra ảnh đúng bước thi công',
              '📐 Đánh giá góc chụp: rộng + cận cảnh',
              '⚠️ Cảnh báo thiếu bằng chứng quan trọng',
              '📋 Tổng kết 8 PM tự động hàng ngày',
            ].map((t) => (
              <Text key={t} style={styles.sheetItem}>
                {t}
              </Text>
            ))}
          </View>
          <TouchableOpacity
            style={styles.sheetBtn}
            onPress={() => {
              onClose();
              router.push('/subscription/ai');
            }}
          >
            <Text style={styles.sheetBtnText}>✨ Mở khoá AI — 700.000đ</Text>
          </TouchableOpacity>
          <Text style={styles.sheetFoot}>Trả 1 lần · Dùng vĩnh viễn · Mọi dự án</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.later}>Không, cảm ơn</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  popup: { backgroundColor: '#fff', borderRadius: 16, padding: 24, alignItems: 'center', width: '100%' },
  popupTag: { fontSize: 14, fontWeight: '700', color: colors.textMuted, marginTop: 8 },
  popupTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 14, textAlign: 'center' },
  popupBody: { fontSize: 12, color: colors.text, textAlign: 'center', marginTop: 6, lineHeight: 17 },
  popupBtn: {
    backgroundColor: colors.ai,
    borderRadius: 10,
    paddingVertical: 12,
    alignSelf: 'stretch',
    alignItems: 'center',
    marginTop: 18,
  },
  popupBtnText: { color: '#fff', fontWeight: '800' },
  popupFoot: { fontSize: 11, color: colors.textMuted, marginTop: 8 },
  later: { fontSize: 12, color: colors.textMuted, textDecorationLine: 'underline', marginTop: 8, textAlign: 'center' },
  sponsor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  sponsorTag: { position: 'absolute', top: 6, right: 10, fontSize: 9, color: colors.textMuted },
  sponsorEmoji: { fontSize: 26 },
  sponsorName: { fontSize: 13, fontWeight: '700', color: colors.text },
  sponsorDesc: { fontSize: 11, color: colors.text, marginTop: 2 },
  sponsorPrice: { fontSize: 13, fontWeight: '800', color: colors.danger, marginTop: 4 },
  sponsorShop: { fontSize: 10, fontWeight: '500', color: colors.textMuted },
  promo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    backgroundColor: colors.primaryLight,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  promoTag: { position: 'absolute', top: 6, right: 10, fontSize: 9, color: colors.textMuted },
  promoTitle: { fontSize: 13, fontWeight: '800', color: colors.primary },
  promoSub: { fontSize: 11, color: colors.text, marginTop: 2 },
  promoLink: { fontSize: 12, fontWeight: '700', color: colors.primary, marginTop: 6 },
  adPopup: { width: '100%', borderRadius: 16, overflow: 'hidden', backgroundColor: '#fff' },
  adPopupImg: { width: '100%', aspectRatio: 4 / 5 },
  adLabel: { fontSize: 11, color: colors.textMuted, padding: 10, textAlign: 'center' },
  adClose: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 14,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adBanner: { borderRadius: 10, overflow: 'hidden', marginBottom: 10 },
  adBannerImg: { width: '100%', aspectRatio: 3 },
  adBannerTag: {
    position: 'absolute',
    top: 6,
    right: 8,
    fontSize: 9,
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 5,
    borderRadius: 4,
  },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(255,255,255,0.92)', justifyContent: 'flex-end' },
  sheetTop: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  sentTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 10 },
  sentSub: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  sentInfo: { fontSize: 12, color: colors.primary, marginTop: 4 },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 12,
  },
  sheetTitle: { fontSize: 15, fontWeight: '800', color: colors.text, textAlign: 'center' },
  sheetBody: { fontSize: 12, color: colors.text, textAlign: 'center', marginTop: 6, lineHeight: 17 },
  sheetList: { borderWidth: 1, borderColor: '#DDD6FE', borderRadius: 10, padding: 12, marginTop: 12, gap: 6 },
  sheetItem: { fontSize: 12, color: '#6D28D9' },
  sheetBtn: { backgroundColor: colors.ai, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 16 },
  sheetBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  sheetFoot: { fontSize: 11, color: colors.textMuted, textAlign: 'center', marginTop: 6 },
});
