import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '@/api/client';
import { colors } from '@/theme';
import type { MyReferralInfo } from '@/types';

const MIN_WITHDRAWAL = 500_000;
const fmtVnd = (n: number) => n.toLocaleString('vi-VN') + 'đ';

/** Rút tiền commission (mockup 33). */
export default function Withdraw() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['affiliate-me'], queryFn: () => api<MyReferralInfo>('/affiliate/me') });
  const [amount, setAmount] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [holder, setHolder] = useState('');

  const submit = useMutation({
    mutationFn: () =>
      api('/affiliate/withdrawals', {
        method: 'POST',
        body: { amount: Number(amount), bankName: bankName.trim(), bankAccount: bankAccount.trim(), accountHolder: holder.trim() },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['affiliate-me'] });
      Alert.alert('Đã gửi yêu cầu', 'Yêu cầu rút tiền sẽ được xử lý vào ngày 1 hoặc 15 gần nhất.', [{ text: 'OK', onPress: () => router.back() }]);
    },
    onError: (e) => Alert.alert('Không gửi được yêu cầu', (e as Error).message),
  });

  const amountNum = Number(amount);
  const withdrawable = data?.withdrawable ?? 0;
  const valid = amountNum >= MIN_WITHDRAWAL && amountNum <= withdrawable && !!bankName.trim() && !!bankAccount.trim() && !!holder.trim();

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <View style={styles.balance}>
        <Text style={styles.balanceLabel}>Số dư khả dụng</Text>
        <Text style={styles.balanceValue}>{fmtVnd(withdrawable)}</Text>
      </View>

      <Label text="Số tiền rút" />
      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        placeholder="5.000.000"
        value={amount ? Number(amount).toLocaleString('vi-VN') : ''}
        onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ''))}
      />
      <Label text="Ngân hàng" />
      <TextInput style={styles.input} placeholder="Vietcombank" value={bankName} onChangeText={setBankName} />
      <Label text="Số tài khoản" />
      <TextInput style={styles.input} keyboardType="number-pad" placeholder="0123456789" value={bankAccount} onChangeText={setBankAccount} />
      <Label text="Chủ tài khoản" />
      <TextInput
        style={styles.input}
        autoCapitalize="characters"
        placeholder="NGUYỄN HÀ"
        value={holder}
        onChangeText={(t) => setHolder(t.toUpperCase())}
      />

      <View style={styles.rules}>
        <Text style={styles.rule}>ℹ️ Tối thiểu: {fmtVnd(MIN_WITHDRAWAL)}</Text>
        <Text style={styles.rule}>📅 Xử lý: Ngày 1 và 15 mỗi tháng</Text>
        <Text style={styles.rule}>⏳ Thời gian: 1-3 ngày làm việc</Text>
      </View>

      <TouchableOpacity
        style={[styles.btn, (!valid || submit.isPending) && { opacity: 0.5 }]}
        disabled={!valid || submit.isPending}
        onPress={() => submit.mutate()}
      >
        {submit.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>💸 Yêu cầu rút tiền</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

function Label({ text }: { text: string }) {
  return (
    <Text style={styles.label}>
      {text} <Text style={{ color: colors.danger }}>*</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  balance: { borderWidth: 1, borderColor: '#FBCFE8', borderRadius: 10, padding: 14, marginBottom: 14 },
  balanceLabel: { fontSize: 12, color: colors.text },
  balanceValue: { fontSize: 22, fontWeight: '800', color: '#BE185D', marginTop: 4 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  input: {
    borderWidth: 1.5,
    borderColor: '#E5E5E5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    marginBottom: 14,
  },
  rules: { borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 10, padding: 12, gap: 4 },
  rule: { fontSize: 12, color: colors.text },
  btn: { backgroundColor: colors.affiliate, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 18, minHeight: 50, justifyContent: 'center' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
