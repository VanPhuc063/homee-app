import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '@/api/client';
import { colors } from '@/theme';
import type { MyReferralInfo } from '@/types';

const fmtVnd = (n: number) => n.toLocaleString('vi-VN') + 'đ';
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });

/**
 * Affiliate (bố cục mockup 30 + 32). Giữ mô hình phẳng 1 tầng đã chốt: mọi user có 1 mã giới thiệu,
 * nhận hoa hồng khi người được giới thiệu mua gói — không có founder/CTV 60/40, không cookie 90 ngày.
 */
export default function AffiliateScreen() {
  const router = useRouter();
  const { data, isLoading } = useQuery({ queryKey: ['affiliate-me'], queryFn: () => api<MyReferralInfo>('/affiliate/me') });

  if (isLoading || !data) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.affiliate} />
      </View>
    );
  }

  const month = new Date().toLocaleDateString('vi-VN', { month: '2-digit', year: 'numeric' });
  const monthCommission = data.recentCommissions
    .filter((c) => new Date(c.createdAt).getMonth() === new Date().getMonth())
    .reduce((s, c) => s + c.amount, 0);
  const buyers = data.referrals.filter((r) => r.earnings > 0).length;

  // ponytail: Copy qua bảng chia sẻ hệ thống (có sẵn "Sao chép") — thêm expo-clipboard thì phải build lại app native.
  const copy = () => Share.share({ message: data.referralCode }).catch(() => undefined);
  const share = () =>
    Share.share({ message: `Dùng app Nhật Ký Thi Công để quản lý công trình minh bạch!\nNhập mã giới thiệu khi đăng ký: ${data.referralCode}` }).catch(
      () => undefined,
    );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={styles.subtitle}>Tháng {month}</Text>

      <View style={styles.hero}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroLabel}>Tổng commission tháng</Text>
          <Text style={styles.heroValue}>{fmtVnd(monthCommission)}</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/affiliate/withdraw')}>
          <Text style={styles.heroBtn}>Rút tiền</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.metricRow}>
        <Metric value={data.totalReferrals} label="Đã giới thiệu" />
        <Metric value={buyers} label="Đã mua gói" />
        <Metric value={data.recentCommissions.length} label="Giao dịch" />
      </View>

      <Text style={styles.section}>Mã ref cá nhân</Text>
      <View style={styles.card}>
        <View style={styles.codeRow}>
          <Text style={styles.code}>{data.referralCode}</Text>
          <TouchableOpacity onPress={copy}>
            <Text style={styles.copy}>📋 Copy</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={share}>
          <Text style={styles.share}>Chia sẻ cho bạn bè →</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Cách hoạt động</Text>
        <Text style={styles.line}>🔗 Bạn bè nhập mã của bạn khi đăng ký</Text>
        <Text style={styles.line}>💰 Nhận commission mỗi khi họ mua gói</Text>
        <Text style={styles.line}>🔄 Recurring commission suốt đời khách</Text>
      </View>

      <Text style={styles.section}>Commission gần đây</Text>
      {data.recentCommissions.length === 0 && <Text style={styles.empty}>Chia sẻ mã của bạn để bắt đầu nhận commission.</Text>}
      {data.recentCommissions.map((c) => (
        <View key={c.id} style={styles.txn}>
          <View style={{ flex: 1 }}>
            <Text style={styles.txnName}>{c.customerName}</Text>
            <Text style={styles.txnSub}>{fmtDay(c.createdAt)}</Text>
          </View>
          <Text style={styles.txnAmount}>{fmtVnd(c.amount)}</Text>
        </View>
      ))}

      {data.referrals.length > 0 && (
        <>
          <Text style={styles.section}>Người đã giới thiệu</Text>
          {data.referrals.map((r) => (
            <View key={r.id} style={styles.txn}>
              <View style={{ flex: 1 }}>
                <Text style={styles.txnName}>{r.name}</Text>
                <Text style={styles.txnSub}>Tham gia {fmtDay(r.joinedAt)}</Text>
              </View>
              {r.earnings > 0 && <Text style={styles.txnAmount}>{fmtVnd(r.earnings)}</Text>}
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  subtitle: { fontSize: 12, color: colors.textMuted, marginBottom: 12 },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FBCFE8',
    borderRadius: 10,
    padding: 14,
  },
  heroLabel: { fontSize: 12, color: colors.text },
  heroValue: { fontSize: 22, fontWeight: '800', color: '#BE185D', marginTop: 4 },
  heroBtn: { fontSize: 12, color: colors.textMuted },
  metricRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  metric: { flex: 1, borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  metricValue: { fontSize: 18, fontWeight: '800', color: '#BE185D' },
  metricLabel: { fontSize: 10, color: colors.text, marginTop: 2 },
  section: { fontSize: 11, fontWeight: '800', color: colors.text, marginTop: 18, marginBottom: 8, textTransform: 'uppercase' },
  card: { borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 10, padding: 14, marginBottom: 10 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 6 },
  codeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  code: { fontSize: 15, color: colors.text, fontWeight: '600', letterSpacing: 1 },
  copy: { fontSize: 12, color: colors.primary },
  share: { fontSize: 12, color: colors.affiliate, fontWeight: '700', marginTop: 10 },
  line: { fontSize: 12, color: colors.text, marginTop: 4 },
  empty: { color: colors.textMuted, fontSize: 12 },
  txn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 10, padding: 14, marginBottom: 8 },
  txnName: { fontSize: 15, fontWeight: '700', color: colors.text },
  txnSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  txnAmount: { fontSize: 13, fontWeight: '800', color: '#BE185D' },
});
