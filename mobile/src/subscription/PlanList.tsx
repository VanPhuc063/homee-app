import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '@/theme';
import type { PlanDef, SubscriptionPlanId, SubscriptionStatus } from '@/types';

const BADGE_LABEL: Record<NonNullable<PlanDef['badge']>, string> = {
  POPULAR: 'Phổ biến',
  BEST: 'Tốt nhất',
};

function fmtVnd(n: number) {
  return n.toLocaleString('vi-VN') + 'đ';
}

/// Tên + dòng phụ hiển thị đúng mockup 26/27 (theo mã gói, không đổi tên lưu ở backend).
const COPY: Partial<Record<SubscriptionPlanId, { title: string; unit?: string; sub?: string }>> = {
  OWNER_MONTHLY: { title: 'Theo tháng', unit: '/tháng', sub: 'Linh hoạt, huỷ bất kỳ lúc nào' },
  OWNER_6MONTH: { title: 'Gói 6 tháng', sub: 'Tiết kiệm 200.000đ — ~467K/tháng' },
  OWNER_9MONTH: { title: 'Gói 9 tháng', sub: 'Tiết kiệm 500.000đ — ~444K/tháng' },
  OWNER_12MONTH: { title: 'Gói 12 tháng', sub: 'Tiết kiệm 1.000.000đ — ~417K/tháng' },
  CONTRACTOR_MONTHLY: { title: 'Theo tháng', unit: '/tháng/1 dự án' },
  CONTRACTOR_10PROJECTS: { title: 'Gói 10 dự án', sub: '300K/dự án — Dùng trong 12 tháng' },
  CONTRACTOR_YEARLY: { title: 'Gói năm', unit: '/năm', sub: 'Không giới hạn dự án — ~833K/tháng' },
};

const FEATURES = {
  OWNER: '✓ 1 dự án — Xem báo cáo + comment — Sync Google Drive — Thông báo Telegram',
  CONTRACTOR: '✓ Quản lý đội — Báo cáo đầy đủ — Vật tư có giá — Upload tiến độ — Sync Google Drive',
};

/** Bảng giá 1 nhóm (mockup 26 Chủ nhà / 27 Nhà thầu): bấm thẻ để mua. */
export function PlanList({
  plans,
  audience,
  status,
  disabled,
  onBuy,
}: {
  plans: Record<SubscriptionPlanId, PlanDef>;
  audience: 'OWNER' | 'CONTRACTOR';
  status?: SubscriptionStatus;
  disabled: boolean;
  onBuy: (def: PlanDef) => void;
}) {
  const items = (Object.entries(plans) as [SubscriptionPlanId, PlanDef][]).filter(([, def]) => def.audience === audience);

  return (
    <View>
      {items.map(([planId, def]) => {
        const copy = COPY[planId] ?? { title: def.label };
        const isActive = status?.plan?.plan === planId;
        const highlighted = !!def.badge;
        return (
          <TouchableOpacity
            key={planId}
            style={[styles.card, highlighted && styles.cardHighlight]}
            disabled={disabled || isActive}
            onPress={() => onBuy(def)}
            activeOpacity={0.8}
          >
            <View style={styles.titleRow}>
              <Text style={styles.title}>{copy.title}</Text>
              {isActive ? (
                <Text style={styles.badge}>Đang dùng</Text>
              ) : (
                !!def.badge && <Text style={styles.badge}>{BADGE_LABEL[def.badge]}</Text>
              )}
            </View>
            <Text style={styles.price}>
              {fmtVnd(def.priceVnd)}
              {!!copy.unit && <Text style={styles.unit}>{copy.unit}</Text>}
            </Text>
            {!!copy.sub && <Text style={[styles.sub, planId === 'OWNER_MONTHLY' && styles.subPlain]}>{copy.sub}</Text>}
          </TouchableOpacity>
        );
      })}
      <View style={styles.payNote}>
        <Text style={styles.payNoteText}>
          💡 1 dự án = 1 bên trả: người tạo dự án trả phí. Thành viên được mời (chủ nhà, nhà thầu, giám sát, đội trưởng) dùng miễn phí.
        </Text>
      </View>
      <View style={[styles.features, audience === 'CONTRACTOR' && styles.featuresBlue]}>
        <Text style={[styles.featuresText, audience === 'CONTRACTOR' && { color: '#2563EB' }]}>{FEATURES[audience]}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.5, borderColor: '#E5E5E5', borderRadius: 10, padding: 14, marginTop: 10, backgroundColor: '#fff' },
  cardHighlight: { borderWidth: 2, borderColor: '#22C55E' },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 14, fontWeight: '700', color: colors.text },
  badge: { fontSize: 11, fontWeight: '600', color: colors.primary },
  price: { fontSize: 22, fontWeight: '800', color: colors.primary, marginTop: 4 },
  unit: { fontSize: 11, fontWeight: '700' },
  sub: { fontSize: 11, color: colors.primary, marginTop: 4 },
  subPlain: { fontSize: 14, color: colors.text },
  payNote: { backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12, marginTop: 12 },
  payNoteText: { fontSize: 12, color: colors.text, lineHeight: 17 },
  features: { borderWidth: 1, borderColor: '#BBF7D0', borderRadius: 10, padding: 12, marginTop: 12 },
  featuresBlue: { borderColor: '#BFDBFE' },
  featuresText: { fontSize: 11, color: colors.primary, lineHeight: 17 },
});
