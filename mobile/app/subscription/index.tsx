import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@/components/Feather';
import { useSubscriptionPurchase } from '@/subscription/useSubscriptionPurchase';
import { colors } from '@/theme';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Gói & Thanh toán: 2 bảng giá theo đối tượng (mockup 26/27) + AI Premium (mockup 28).
export default function SubscriptionHub() {
  const router = useRouter();
  const { status, plansLoading } = useSubscriptionPurchase();

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {status && (
        <View style={styles.statusCard}>
          <Feather name={status.plan ? 'check-circle' : 'info'} size={18} color="#fff" />
          <View style={{ flex: 1 }}>
            {status.plan ? (
              <>
                <Text style={styles.statusTitle}>{status.plan.label}</Text>
                <Text style={styles.statusSub}>
                  {status.plan.isAutoRenewing ? 'Tự động gia hạn' : 'Hết hạn'}
                  {status.plan.expiresAt ? ` · ${fmtDate(status.plan.expiresAt)}` : ''}
                </Text>
              </>
            ) : (
              <Text style={styles.statusTitle}>Đang dùng gói miễn phí</Text>
            )}
          </View>
        </View>
      )}

      {plansLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}

      <TouchableOpacity style={styles.entry} onPress={() => router.push('/subscription/owner')}>
        <View style={styles.entryIcon}>
          <Feather name="home" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.entryTitle}>Bảng giá Chủ nhà</Text>
          <Text style={styles.entryHint}>Theo tháng, 6, 9, 12 tháng</Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.textMuted} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.entry} onPress={() => router.push('/subscription/contractor')}>
        <View style={styles.entryIcon}>
          <Feather name="tool" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.entryTitle}>Bảng giá Nhà thầu</Text>
          <Text style={styles.entryHint}>Theo tháng, 10 dự án, gói năm</Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.textMuted} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.entry} onPress={() => router.push('/subscription/ai')}>
        <View style={[styles.entryIcon, { backgroundColor: '#F5F3FF' }]}>
          <Feather name="zap" size={18} color={colors.ai} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.entryTitle}>AI Premium</Text>
          <Text style={styles.entryHint}>{status?.aiPremium ? 'Đã mở khoá' : '700.000đ — Trả 1 lần, dùng vĩnh viễn'}</Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.textMuted} />
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.primary,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  statusTitle: { color: '#fff', fontWeight: '800', fontSize: 15 },
  statusSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
  },
  entryIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  entryHint: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
