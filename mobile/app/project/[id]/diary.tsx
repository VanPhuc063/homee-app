import { Feather } from '@/components/Feather';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useGlobalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { api } from '@/api/client';
import { colors } from '@/theme';
import type { ActivityKind, ActivityLog } from '@/types';

const KIND_META: Record<ActivityKind, { icon: keyof typeof Feather.glyphMap; color: string }> = {
  NOTE: { icon: 'edit-3', color: colors.textMuted },
  STEP_SUBMITTED: { icon: 'upload', color: '#2563EB' },
  STEP_APPROVED: { icon: 'check-circle', color: colors.success },
  STEP_REJECTED: { icon: 'x-circle', color: colors.danger },
  EVIDENCE_ADDED: { icon: 'image', color: colors.textMuted },
  DEFECT_CREATED: { icon: 'alert-triangle', color: colors.danger },
  DEFECT_UPDATED: { icon: 'alert-circle', color: colors.warning },
  PAYMENT_STAGE_CONFIRMED: { icon: 'dollar-sign', color: colors.success },
  PLAN_APPROVED: { icon: 'check-square', color: colors.primary },
  MATERIAL_CHECK_SUBMITTED: { icon: 'package', color: '#2563EB' },
  MATERIAL_CHECK_DECIDED: { icon: 'clipboard', color: colors.primary },
  PHASE_ADDED: { icon: 'plus-square', color: colors.primary },
  PHASE_REMOVED: { icon: 'minus-square', color: colors.danger },
  STEP_ADDED: { icon: 'plus-square', color: colors.primary },
  STEP_REMOVED: { icon: 'minus-square', color: colors.danger },
  PHASE_DURATION_CHANGED: { icon: 'clock', color: colors.warning },
  PLAN_CHANGE_REQUESTED: { icon: 'send', color: '#2563EB' },
  PLAN_CHANGE_APPROVED: { icon: 'check-square', color: colors.success },
  PLAN_CHANGE_REJECTED: { icon: 'x-square', color: colors.danger },
  INVITE_ACCEPTED: { icon: 'user-check', color: colors.success },
  INVITE_DECLINED: { icon: 'user-x', color: colors.danger },
  PHASE_REORDERED: { icon: 'shuffle', color: colors.textMuted },
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function DiaryScreen() {
  // Xem giải thích ở members.tsx — màn này cũng nằm sâu hơn 1 cấp so với segment "[id]" nên phải
  // dùng global search params mới lấy được id của dự án.
  const { id: projectId } = useGlobalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const [note, setNote] = useState('');

  const { data: logs, isLoading } = useQuery({
    queryKey: ['activity', projectId],
    queryFn: () => api<ActivityLog[]>(`/projects/${projectId}/activity`),
    enabled: !!projectId,
  });

  const addNote = useMutation({
    mutationFn: () =>
      api(`/projects/${projectId}/activity`, { method: 'POST', body: { message: note.trim() } }),
    onSuccess: () => {
      setNote('');
      qc.invalidateQueries({ queryKey: ['activity', projectId] });
    },
    onError: (e) => Alert.alert('Lỗi', (e as Error).message),
  });

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      data={logs ?? []}
      keyExtractor={(l) => l.id}
      ListHeaderComponent={
        <View>
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              Nhật ký ghi lại toàn bộ mốc quan trọng của công trình, tự động khi có duyệt bước,
              lỗi mới, ứng tiền..., cộng thêm ghi chú bạn tự thêm tay.
            </Text>
          </View>
          <View style={styles.noteForm}>
            <TextInput
              style={styles.noteInput}
              placeholder="Ghi chú thêm về công trình hôm nay…"
              value={note}
              onChangeText={setNote}
              multiline
            />
            <TouchableOpacity
              style={[styles.noteBtn, (!note.trim() || addNote.isPending) && { opacity: 0.5 }]}
              disabled={!note.trim() || addNote.isPending}
              onPress={() => addNote.mutate()}
            >
              <Text style={styles.noteBtnText}>{addNote.isPending ? 'Đang lưu…' : 'Thêm ghi chú'}</Text>
            </TouchableOpacity>
          </View>
          {isLoading && <Text style={styles.empty}>Đang tải…</Text>}
        </View>
      }
      ListEmptyComponent={!isLoading ? <Text style={styles.empty}>Chưa có nhật ký nào.</Text> : null}
      renderItem={({ item }) => {
        const meta = KIND_META[item.kind] ?? KIND_META.NOTE;
        return (
          <View style={styles.row}>
            <View style={[styles.iconWrap, { borderColor: meta.color }]}>
              <Feather name={meta.icon} size={14} color={meta.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.message}>{item.message}</Text>
              <Text style={styles.meta}>
                {item.actor ? `${item.actor.name} · ` : ''}
                {formatTime(item.createdAt)}
              </Text>
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  notice: { backgroundColor: colors.primaryLight, borderRadius: 12, padding: 12, marginBottom: 14 },
  noticeText: { color: colors.primary, fontSize: 12, lineHeight: 18 },
  noteForm: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    fontSize: 13, color: colors.text,
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: 8,
  },
  noteBtn: { backgroundColor: colors.primary, borderRadius: 10, padding: 10, alignItems: 'center' },
  noteBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 12, lineHeight: 20 },
  row: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: { color: colors.text, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  meta: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
});
