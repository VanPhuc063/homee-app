import { ActivityIndicator, ScrollView, StyleSheet, Text } from 'react-native';
import { PlanList } from '@/subscription/PlanList';
import { useSubscriptionPurchase } from '@/subscription/useSubscriptionPurchase';
import { colors } from '@/theme';

export default function OwnerPlans() {
  const { plans, plansLoading, status, connected, buy, verifying } = useSubscriptionPurchase();

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={styles.hint}>Chọn gói phù hợp với dự án của bạn</Text>
      {!connected && <Text style={styles.warn}>Đang kết nối App Store/Google Play…</Text>}
      {plansLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}
      {plans && (
        <PlanList plans={plans} audience="OWNER" status={status} disabled={verifying} onBuy={buy} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  hint: { color: colors.text, fontSize: 13, textAlign: 'center', marginBottom: 4 },
  warn: { color: colors.warning, fontSize: 12, fontWeight: '600', marginTop: 8 },
});
