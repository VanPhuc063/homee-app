import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { api } from '@/api/client';
import { MoneyPanel } from '@/payments/MoneyPanel';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Phase, PaymentStage, Project } from '@/types';

const fmt = (n: string | number) => Number(n).toLocaleString('vi-VN') + ' đ';

export default function Payments() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [phaseId, setPhaseId] = useState<string | null>(null);

  const { data: stages } = useQuery({
    queryKey: ['payments', projectId],
    queryFn: () => api<PaymentStage[]>(`/projects/${projectId}/payment-stages`),
    enabled: !!projectId,
  });
  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/projects'),
  });
  const project = projects?.find((p) => p.id === projectId);
  const myRole = project?.members.find((m) => m.userId === user?.id)?.role;
  const canView = myRole === 'OWNER' || myRole === 'MAIN_CONTRACTOR';
  const canCreateStage = project?.status === 'PLANNING' && canView;

  const { data: phases } = useQuery({
    queryKey: ['phases', projectId],
    queryFn: () => api<Phase[]>(`/projects/${projectId}/phases`),
    enabled: !!projectId && canCreateStage,
  });

  const confirmPaid = useMutation({
    mutationFn: (stageId: string) =>
      api(`/payment-stages/${stageId}/confirm-paid`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payments', projectId] }),
    onError: (e) => Alert.alert('Chưa đủ điều kiện', (e as Error).message),
  });

  const createStage = useMutation({
    mutationFn: () =>
      api(`/projects/${projectId}/payment-stages`, {
        method: 'POST',
        body: { name, amount: Number(amount), unlockAfterPhaseId: phaseId },
      }),
    onSuccess: () => {
      setName('');
      setAmount('');
      setPhaseId(null);
      qc.invalidateQueries({ queryKey: ['payments', projectId] });
    },
    onError: (e) => Alert.alert('Lỗi', (e as Error).message),
  });

  const statusMeta: Record<string, { label: string; color: string; hint: string }> = {
    LOCKED: {
      label: 'Chưa đủ điều kiện',
      color: colors.locked,
      hint: 'Giai đoạn mốc chưa hoàn thành hoặc còn lỗi chưa sửa',
    },
    ELIGIBLE: {
      label: 'Đủ điều kiện ứng',
      color: colors.warning,
      hint: 'Chuyển khoản trực tiếp cho thầu, sau đó xác nhận tại đây',
    },
    CONFIRMED_PAID: { label: 'Đã ứng', color: colors.success, hint: '' },
  };

  if (project && !canView) {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>
          Ứng tiền là thoả thuận giữa chủ nhà và thầu chính, bạn không có quyền xem mục này.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <MoneyPanel projectId={projectId!} />
      <Text style={{ fontSize: 14, fontWeight: '800', color: colors.text, marginBottom: 8 }}>Thanh toán theo đợt</Text>
      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          Homeee không giữ tiền của bạn. App chỉ khóa/mở điều kiện ứng tiền theo tiến độ đã được
          duyệt, việc chuyển tiền do bạn và thầu thực hiện trực tiếp.
        </Text>
      </View>

      {canCreateStage && (
        <View style={styles.form}>
          <Text style={styles.formLabel}>+ Thêm đợt ứng tiền</Text>
          <TextInput
            style={styles.input}
            placeholder="Tên đợt (VD: Đợt 2, xong phần thô)"
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={styles.input}
            placeholder="Số tiền (VNĐ)"
            keyboardType="number-pad"
            value={amount}
            onChangeText={setAmount}
          />
          <Text style={styles.formLabel}>Mở khi hạng mục mốc hoàn thành</Text>
          <View style={styles.chipRow}>
            {(phases ?? [])
              .sort((a, b) => a.order - b.order)
              .map((ph) => (
                <TouchableOpacity
                  key={ph.id}
                  style={[styles.phaseChip, phaseId === ph.id && styles.phaseChipActive]}
                  onPress={() => setPhaseId(ph.id)}
                >
                  <Text
                    style={[styles.phaseChipText, phaseId === ph.id && styles.phaseChipTextActive]}
                  >
                    {ph.code}
                  </Text>
                </TouchableOpacity>
              ))}
          </View>
          <TouchableOpacity
            style={[
              styles.confirmBtn,
              styles.createBtn,
              (!name.trim() || !amount || !phaseId || createStage.isPending) && { opacity: 0.5 },
            ]}
            disabled={!name.trim() || !amount || !phaseId || createStage.isPending}
            onPress={() => createStage.mutate()}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
              {createStage.isPending ? 'Đang tạo…' : 'Tạo đợt ứng tiền'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {(stages ?? []).map((s) => {
        const meta = statusMeta[s.status];
        return (
          <View key={s.id} style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>
                Đợt {s.order}: {s.name}
              </Text>
              <Text style={styles.amount}>{fmt(s.amount)}</Text>
              <Text style={styles.milestone}>
                Mốc: {s.unlockAfterPhase.code}. {s.unlockAfterPhase.name}
              </Text>
              {!!meta.hint && <Text style={styles.hint}>{meta.hint}</Text>}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 8 }}>
              <Text style={[styles.chip, { color: meta.color, borderColor: meta.color }]}>
                {meta.label}
              </Text>
              {myRole === 'OWNER' && s.status === 'ELIGIBLE' && (
                <TouchableOpacity
                  style={styles.confirmBtn}
                  onPress={() =>
                    Alert.alert(
                      'Xác nhận đã ứng tiền?',
                      `Bạn xác nhận đã chuyển ${fmt(s.amount)} cho thầu ngoài app?`,
                      [
                        { text: 'Hủy', style: 'cancel' },
                        { text: 'Xác nhận', onPress: () => confirmPaid.mutate(s.id) },
                      ],
                    )
                  }
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
                    Đã chuyển tiền
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        );
      })}

      {(stages ?? []).length === 0 && (
        <Text style={styles.empty}>
          Chưa thiết lập đợt ứng tiền. Thầu chính hoặc chủ nhà tạo các đợt gắn với mốc hạng mục khi
          lập kế hoạch.
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  notice: {
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  noticeText: { color: colors.primary, fontSize: 13, lineHeight: 19 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  name: { fontWeight: '700', color: colors.text },
  amount: { fontSize: 17, fontWeight: '800', color: colors.primary, marginTop: 4 },
  milestone: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  hint: { color: colors.textMuted, fontSize: 11, marginTop: 6, fontStyle: 'italic' },
  chip: {
    fontSize: 11,
    fontWeight: '700',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  confirmBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40, lineHeight: 20 },
  form: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  formLabel: { fontWeight: '700', color: colors.text, marginBottom: 8, fontSize: 13 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    fontSize: 14, color: colors.text,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  phaseChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.bg,
  },
  phaseChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  phaseChipText: { fontSize: 12, color: colors.text },
  phaseChipTextActive: { color: '#fff', fontWeight: '700' },
  createBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
});
