import { useQuery } from '@tanstack/react-query';
import { useGlobalSearchParams, useRouter } from 'expo-router';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '@/api/client';
import { Feather } from '@/components/Feather';
import { colors } from '@/theme';
import type { PlanDef, SubscriptionPlanId, SubscriptionStatus } from '@/types';

function fmtVnd(n: number) {
  return n.toLocaleString('vi-VN') + 'đ';
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Biên lai sau khi xác thực giao dịch IAP thành công (mockup 29).
export default function SubscriptionSuccess() {
  const { planId, txn } = useGlobalSearchParams<{ planId: SubscriptionPlanId; txn?: string }>();
  const router = useRouter();

  const { data: plans } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: () => api<Record<SubscriptionPlanId, PlanDef>>('/me/subscription/plans'),
  });
  const { data: status } = useQuery({
    queryKey: ['subscription-status'],
    queryFn: () => api<SubscriptionStatus>('/me/subscription'),
  });

  const def = planId && plans ? plans[planId] : undefined;
  const now = new Date();
  const paidAt = `${fmtDate(now.toISOString())} — ${now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={styles.hero}>
        <Feather name="check-circle" size={40} color={colors.primary} />
        <Text style={styles.heroTitle}>Thanh toán thành công!</Text>
        {def && (
          <Text style={styles.heroSub}>
            {def.label} — {fmtVnd(def.priceVnd)}
          </Text>
        )}
      </View>

      <View style={styles.receipt}>
        {!!txn && <Row label="Mã giao dịch" value={txn} />}
        <Row label="Ngày" value={paidAt} />
        {def && <Row label="Gói" value={def.label} />}
        {planId !== 'AI_PREMIUM' && status?.plan?.expiresAt && <Row label="Hết hạn" value={fmtDate(status.plan.expiresAt)} />}
        <Row label="Thanh toán" value={Platform.OS === 'ios' ? 'App Store' : 'Google Play'} />
      </View>

      <TouchableOpacity onPress={() => router.replace('/')}>
        <Text style={styles.back}>Về Dashboard</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Text style={styles.row}>
      <Text style={{ fontWeight: '700' }}>{label}:</Text> {value}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  hero: { alignItems: 'center', paddingVertical: 28 },
  heroTitle: { fontSize: 18, fontWeight: '800', color: colors.primary, marginTop: 14 },
  heroSub: { fontSize: 13, color: colors.text, marginTop: 6 },
  receipt: { borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 10, padding: 14, gap: 10 },
  row: { fontSize: 13, color: colors.text },
  back: { textAlign: 'center', color: colors.textMuted, fontWeight: '600', marginTop: 20, paddingVertical: 8 },
});
