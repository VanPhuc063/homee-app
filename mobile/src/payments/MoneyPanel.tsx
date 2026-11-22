import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '@/api/client';
import { colors } from '@/theme';

const fmt = (n: number) => n.toLocaleString('vi-VN') + 'đ';

interface Money {
  contract: number;
  paid: number;
  extra: number;
  total: number;
  remaining: number;
  extras: { id: string; title: string; amount: number; note: string | null; status: 'PENDING' | 'APPROVED' | 'REJECTED'; mine: boolean; createdAt: string }[];
}

const STATUS = { PENDING: ['Chờ duyệt', '#B45309'], APPROVED: ['Đã duyệt', colors.primary], REJECTED: ['Từ chối', colors.danger] } as const;

/** Tổng quan tiền + chi phí phát sinh (review 10.6 #5) — đầu màn Thanh toán theo đợt. */
export function MoneyPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [showForm, setShowForm] = useState(false);

  const { data } = useQuery({ queryKey: ['money', projectId], queryFn: () => api<Money>(`/projects/${projectId}/money`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['money', projectId] });

  const propose = useMutation({
    mutationFn: () => api(`/projects/${projectId}/extra-costs`, { method: 'POST', body: { title: title.trim(), amount: Number(amount) } }),
    onSuccess: () => {
      setTitle('');
      setAmount('');
      setShowForm(false);
      refresh();
    },
    onError: (e) => Alert.alert('Lỗi', (e as Error).message),
  });
  const decide = useMutation({
    mutationFn: (p: { id: string; approve: boolean }) => api(`/extra-costs/${p.id}/decide`, { method: 'POST', body: { approve: p.approve } }),
    onSuccess: refresh,
    onError: (e) => Alert.alert('Lỗi', (e as Error).message),
  });

  if (!data) return null;
  const pct = data.total ? Math.round((data.paid / data.total) * 100) : 0;

  return (
    <View style={{ marginBottom: 16 }}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Tổng quan chi phí</Text>
        <Row k="Dự toán hợp đồng" v={fmt(data.contract)} />
        <Row k="Phát sinh đã duyệt" v={`+ ${fmt(data.extra)}`} color={data.extra ? '#B45309' : undefined} />
        <Row k="Tổng" v={fmt(data.total)} bold />
        <Row k="Đã trả" v={fmt(data.paid)} color={colors.primary} />
        <Row k="Còn lại" v={fmt(data.remaining)} bold />
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.min(100, pct)}%` }]} />
        </View>
        <Text style={styles.pct}>Đã trả {pct}%</Text>
      </View>

      <View style={styles.headRow}>
        <Text style={styles.section}>Chi phí phát sinh</Text>
        <TouchableOpacity onPress={() => setShowForm((v) => !v)}>
          <Text style={styles.link}>{showForm ? 'Đóng' : '+ Đề xuất phát sinh'}</Text>
        </TouchableOpacity>
      </View>
      {showForm && (
        <View style={styles.card}>
          <TextInput style={styles.input} placeholder="Nội dung (VD: Thêm ổ cắm tầng 2)" value={title} onChangeText={setTitle} />
          <TextInput
            style={styles.input}
            placeholder="Số tiền (đ)"
            keyboardType="number-pad"
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/\D/g, ''))}
          />
          <TouchableOpacity
            style={[styles.btn, (!title.trim() || !Number(amount) || propose.isPending) && { opacity: 0.5 }]}
            disabled={!title.trim() || !Number(amount) || propose.isPending}
            onPress={() => propose.mutate()}
          >
            <Text style={styles.btnText}>Gửi đề xuất</Text>
          </TouchableOpacity>
        </View>
      )}
      {data.extras.length === 0 && <Text style={styles.empty}>Chưa có phát sinh nào.</Text>}
      {data.extras.map((x) => (
        <View key={x.id} style={styles.extra}>
          <View style={{ flex: 1 }}>
            <Text style={styles.extraTitle}>{x.title}</Text>
            <Text style={styles.extraAmount}>{fmt(x.amount)}</Text>
          </View>
          {x.status === 'PENDING' && !x.mine ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={() => decide.mutate({ id: x.id, approve: false })}>
                <Text style={[styles.decide, { color: colors.danger }]}>Từ chối</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => decide.mutate({ id: x.id, approve: true })}>
                <Text style={[styles.decide, { color: colors.primary }]}>Duyệt</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={[styles.status, { color: STATUS[x.status][1] }]}>{STATUS[x.status][0]}</Text>
          )}
        </View>
      ))}
    </View>
  );
}

function Row({ k, v, bold, color }: { k: string; v: string; bold?: boolean; color?: string }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.k, bold && { fontWeight: '800', color: colors.text }]}>{k}</Text>
      <Text style={[styles.v, bold && { fontWeight: '800' }, color ? { color } : null]}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 10, padding: 14, marginBottom: 10, backgroundColor: '#fff' },
  cardTitle: { fontSize: 14, fontWeight: '800', color: colors.text, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  k: { fontSize: 13, color: colors.textMuted },
  v: { fontSize: 13, color: colors.text, fontWeight: '600' },
  track: { height: 6, borderRadius: 3, backgroundColor: '#E5E5E5', overflow: 'hidden', marginTop: 10 },
  fill: { height: '100%', backgroundColor: colors.primary },
  pct: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, marginBottom: 8 },
  section: { fontSize: 14, fontWeight: '800', color: colors.text },
  link: { fontSize: 13, fontWeight: '700', color: colors.primary },
  input: { borderWidth: 1.5, borderColor: '#E5E5E5', borderRadius: 10, padding: 12, fontSize: 14, color: colors.text, marginBottom: 10 },
  btn: { backgroundColor: colors.primary, borderRadius: 10, padding: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700' },
  empty: { fontSize: 12, color: colors.textMuted, marginBottom: 6 },
  extra: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 10, padding: 12, marginBottom: 8 },
  extraTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  extraAmount: { fontSize: 12, color: '#B45309', marginTop: 2 },
  decide: { fontSize: 13, fontWeight: '700' },
  status: { fontSize: 12, fontWeight: '700' },
});
