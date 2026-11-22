import { useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@/components/Feather';
import { useSubscriptionPurchase } from '@/subscription/useSubscriptionPurchase';
import { colors } from '@/theme';

const FEATURES = [
  'AI kiểm tra báo cáo tự động',
  'AI đối chiếu tiến độ PDF',
  'Cảnh báo sai lệch tự động',
  'Tổng kết 8 PM hàng ngày',
  'AI tư vấn cho chủ nhà',
  '300 lượt AI mỗi dự án mỗi tháng',
  'Áp dụng cho tất cả dự án',
];

/** Mockup 28 — AI Premium 700.000đ trả 1 lần (IAP one-time `AI_PREMIUM`). */
export default function AiPremium() {
  const qc = useQueryClient();
  const { plans, status, buy, verifying, connected } = useSubscriptionPurchase();
  const def = plans?.AI_PREMIUM;
  const owned = !!status?.aiPremium;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.iconWrap}>
        <Feather name="zap" size={34} color={colors.ai} />
      </View>
      <Text style={styles.price}>700.000đ</Text>
      <Text style={styles.sub}>Trả 1 lần — Dùng vĩnh viễn</Text>

      <View style={styles.card}>
        {FEATURES.map((f) => (
          <View key={f} style={styles.row}>
            <Text style={styles.check}>✅</Text>
            <Text style={styles.feature}>{f}</Text>
          </View>
        ))}
      </View>

      {owned ? (
        <View style={styles.ownedBox}>
          <Text style={styles.ownedText}>✓ Bạn đã mở khoá AI</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.buyBtn, (!def || verifying) && { opacity: 0.6 }]}
          disabled={!def || verifying}
          onPress={async () => {
            if (!def) return;
            await buy(def);
            qc.invalidateQueries({ queryKey: ['ai-status'] });
          }}
        >
          {verifying ? <ActivityIndicator color="#fff" /> : <Text style={styles.buyText}>✨ Mở khoá AI — 700.000đ</Text>}
        </TouchableOpacity>
      )}
      {!connected && !owned && <Text style={styles.hint}>Đang kết nối App Store/Google Play…</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingBottom: 40 },
  iconWrap: { alignSelf: 'center', marginTop: 20, marginBottom: 12 },
  price: { fontSize: 26, fontWeight: '800', color: '#5B21B6', textAlign: 'center' },
  sub: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: 4, marginBottom: 20 },
  card: { borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 10, padding: 14, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  check: { fontSize: 14 },
  feature: { fontSize: 13, color: colors.text },
  buyBtn: { backgroundColor: colors.ai, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 20, minHeight: 50, justifyContent: 'center' },
  buyText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  ownedBox: { backgroundColor: '#F5F3FF', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 20 },
  ownedText: { color: colors.ai, fontWeight: '800' },
  hint: { textAlign: 'center', color: colors.textMuted, fontSize: 12, marginTop: 10 },
});
