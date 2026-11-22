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
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Defect, Project } from '@/types';

const statusMeta: Record<string, { label: string; color: string }> = {
  OPEN: { label: 'Đang mở', color: colors.danger },
  FIXED: { label: 'Đã sửa, chờ xác nhận', color: colors.warning },
  CLOSED: { label: 'Đã đóng', color: colors.success },
};

export default function Defects() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const [title, setTitle] = useState('');

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/projects'),
  });
  const myRole = projects
    ?.find((p) => p.id === projectId)
    ?.members.find((m) => m.userId === user?.id)?.role;
  const canCreate = myRole === 'OWNER' || myRole === 'SUPERVISOR';
  const canFix = myRole === 'MAIN_CONTRACTOR' || myRole === 'SUB_CONTRACTOR';
  const canClose = myRole === 'OWNER' || myRole === 'SUPERVISOR';

  const { data: defects, isLoading } = useQuery({
    queryKey: ['defects', projectId],
    queryFn: () => api<Defect[]>(`/projects/${projectId}/defects`),
    enabled: !!projectId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['defects', projectId] });
    qc.invalidateQueries({ queryKey: ['payments', projectId] });
  };

  const createDefect = useMutation({
    mutationFn: () => api(`/projects/${projectId}/defects`, { method: 'POST', body: { title } }),
    onSuccess: () => {
      setTitle('');
      invalidate();
    },
    onError: (e) => Alert.alert('Lỗi', (e as Error).message),
  });

  const updateStatus = useMutation({
    mutationFn: (p: { id: string; status: 'FIXED' | 'CLOSED' | 'OPEN' }) =>
      api(`/defects/${p.id}`, { method: 'PATCH', body: { status: p.status } }),
    onSuccess: invalidate,
    onError: (e) => Alert.alert('Lỗi', (e as Error).message),
  });

  const openCount = (defects ?? []).filter((d) => d.status !== 'CLOSED').length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          Còn {openCount} lỗi chưa đóng sẽ chặn đợt ứng tiền có mốc thuộc giai đoạn tương ứng.
        </Text>
      </View>

      {canCreate && (
        <View style={styles.form}>
          <Text style={styles.label}>Ghi nhận lỗi mới</Text>
          <TextInput
            style={styles.input}
            placeholder="VD: Tường trát bị nứt chân chim khu bếp"
            value={title}
            onChangeText={setTitle}
            multiline
          />
          <TouchableOpacity
            style={[styles.submitBtn, (!title.trim() || createDefect.isPending) && { opacity: 0.5 }]}
            disabled={!title.trim() || createDefect.isPending}
            onPress={() => createDefect.mutate()}
          >
            <Text style={styles.submitText}>
              {createDefect.isPending ? 'Đang ghi nhận…' : 'Ghi nhận lỗi'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.section}>Danh sách lỗi</Text>
      {isLoading && <Text style={styles.empty}>Đang tải…</Text>}
      {(defects ?? []).map((d) => {
        const meta = statusMeta[d.status];
        return (
          <View key={d.id} style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{d.title}</Text>
              {d.step && <Text style={styles.meta}>Thuộc bước: {d.step.name}</Text>}
              <Text style={styles.meta}>Người báo: {d.raisedBy.name}</Text>
              <Text style={[styles.chip, { color: meta.color, borderColor: meta.color }]}>
                {meta.label}
              </Text>
            </View>
            <View style={{ gap: 6, alignItems: 'flex-end' }}>
              {canFix && d.status === 'OPEN' && (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: colors.warning }]}
                  onPress={() => updateStatus.mutate({ id: d.id, status: 'FIXED' })}
                >
                  <Text style={styles.actionText}>Đã sửa xong</Text>
                </TouchableOpacity>
              )}
              {canClose && d.status === 'FIXED' && (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: colors.success }]}
                  onPress={() => updateStatus.mutate({ id: d.id, status: 'CLOSED' })}
                >
                  <Text style={styles.actionText}>Xác nhận & đóng</Text>
                </TouchableOpacity>
              )}
              {canClose && d.status === 'FIXED' && (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: colors.danger }]}
                  onPress={() => updateStatus.mutate({ id: d.id, status: 'OPEN' })}
                >
                  <Text style={styles.actionText}>Chưa đạt, mở lại</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        );
      })}
      {!isLoading && (defects ?? []).length === 0 && (
        <Text style={styles.empty}>Chưa có lỗi nào được ghi nhận.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  notice: { backgroundColor: colors.primaryLight, borderRadius: 12, padding: 12, marginBottom: 16 },
  noticeText: { color: colors.primary, fontSize: 13, lineHeight: 19 },
  section: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 10, marginTop: 8 },
  form: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { fontWeight: '700', color: colors.text, marginBottom: 8, fontSize: 13 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    fontSize: 14, color: colors.text,
    minHeight: 44,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  submitText: { color: '#fff', fontWeight: '700' },
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
  title: { fontWeight: '700', color: colors.text, fontSize: 14 },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  chip: {
    fontSize: 11,
    fontWeight: '700',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  actionBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  actionText: { color: '#fff', fontWeight: '700', fontSize: 11 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 20, lineHeight: 20 },
});
