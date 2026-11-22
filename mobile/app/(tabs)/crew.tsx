import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Feather } from '@/components/Feather';
import { colors, roleLabel } from '@/theme';
import type { CrewMember, ProjectRole } from '@/types';

const DEFAULT_ROLE_OPTIONS: ProjectRole[] = ['SUB_CONTRACTOR', 'SUPERVISOR'];

export default function Crew() {
  const qc = useQueryClient();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [defaultRole, setDefaultRole] = useState<ProjectRole>('SUB_CONTRACTOR');

  const { data: crew, isLoading } = useQuery({
    queryKey: ['crew'],
    queryFn: () => api<CrewMember[]>('/me/crew'),
  });

  const addCrew = useMutation({
    mutationFn: () =>
      api('/me/crew', { method: 'POST', body: { phone, name, defaultRole } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crew'] });
      setPhone('');
      setName('');
    },
    onError: (e) => Alert.alert('Lỗi', (e as Error).message),
  });

  const removeCrew = useMutation({
    mutationFn: (id: string) => api(`/me/crew/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crew'] }),
    onError: (e) => Alert.alert('Lỗi', (e as Error).message),
  });

  const confirmRemove = (member: CrewMember) => {
    Alert.alert('Xoá khỏi đội của tôi?', `${member.name} (${member.phone})`, [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Xoá', style: 'destructive', onPress: () => removeCrew.mutate(member.id) },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={styles.hint}>
        Danh sách thợ/thầu phụ quen thuộc của riêng bạn, dùng để mời nhanh khi bạn làm thầu chính ở
        bất kỳ công trình nào, không phải gõ lại số điện thoại mỗi lần.
      </Text>

      <Text style={styles.section}>Thành viên đã lưu</Text>
      {isLoading && <Text style={styles.empty}>Đang tải…</Text>}
      {!isLoading && (crew ?? []).length === 0 && (
        <Text style={styles.empty}>Chưa có ai trong đội của bạn.</Text>
      )}
      {(crew ?? []).map((m) => (
        <View key={m.id} style={styles.card}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{m.name}</Text>
            <Text style={styles.phone}>{m.phone}</Text>
          </View>
          <Text style={styles.roleChip}>{roleLabel[m.defaultRole]}</Text>
          <TouchableOpacity onPress={() => confirmRemove(m)} style={styles.removeBtn}>
            <Feather name="trash-2" size={18} color={colors.danger} />
          </TouchableOpacity>
        </View>
      ))}

      <Text style={styles.section}>Thêm vào đội</Text>
      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Số điện thoại"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />
        <TextInput style={styles.input} placeholder="Tên" value={name} onChangeText={setName} />

        <Text style={styles.label}>Vai trò mặc định</Text>
        <View style={styles.chipRow}>
          {DEFAULT_ROLE_OPTIONS.map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.chip, defaultRole === r && styles.chipActive]}
              onPress={() => setDefaultRole(r)}
            >
              <Text style={[styles.chipText, defaultRole === r && styles.chipTextActive]}>
                {roleLabel[r]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[
            styles.submitBtn,
            (phone.length < 10 || !name || addCrew.isPending) && { opacity: 0.5 },
          ]}
          disabled={phone.length < 10 || !name || addCrew.isPending}
          onPress={() => addCrew.mutate()}
        >
          <Text style={styles.submitText}>
            {addCrew.isPending ? 'Đang lưu…' : 'Lưu vào đội của tôi'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  section: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 10, marginTop: 8 },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginBottom: 4 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 4, marginBottom: 8 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  name: { fontWeight: '700', color: colors.text },
  phone: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  roleChip: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: colors.primaryLight,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  removeBtn: { padding: 6 },
  form: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    fontSize: 15, color: colors.text,
  },
  label: { fontWeight: '700', color: colors.text, marginBottom: 8, marginTop: 4, fontSize: 13 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.bg,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, color: colors.text },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  submitText: { color: '#fff', fontWeight: '700' },
});
