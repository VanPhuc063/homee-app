import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '@/api/client';
import { useAuth } from '@/store/auth';
import { colors, roleLabel } from '@/theme';
import type { ProjectInvite } from '@/types';

/**
 * Popup hiện ngay khi vừa đăng nhập hoặc vừa mở lại app nếu có lời mời dự án đang PENDING — tránh
 * người dùng phải tự vào Hồ sơ mới biết có lời mời (đặc biệt quan trọng từ khi mời bằng SĐT cũng
 * cần chấp nhận, xem ProjectsService.addMember). Bấm "Để sau" chỉ ẩn tạm trong phiên hiện tại
 * (nhớ theo id) — lời mời MỚI phát sinh sau đó (id khác) vẫn hiện lại bình thường; lời mời cũ vẫn
 * còn nguyên ở Hồ sơ để xem lại bất cứ lúc nào.
 */
export function InvitePopup() {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  // Theo dõi riêng invite đang xử lý (thay vì respond.isPending dùng chung) — tránh khoảng trống
  // UI giữa lúc mutation xong (isPending về false) và lúc invalidateQueries fetch lại xong, dễ
  // khiến người dùng bấm lần 2 vào đúng lúc đó và dính lỗi "lời mời đã được xử lý rồi".
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const { data: invites } = useQuery({
    queryKey: ['my-invites'],
    queryFn: () => api<ProjectInvite[]>('/me/invites'),
    enabled: !!user,
    refetchInterval: 60_000,
  });

  const respond = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) =>
      api(`/invites/${id}/respond`, { method: 'POST', body: { accept } }),
    onMutate: ({ id }) => setRespondingId(id),
    onSuccess: (_data, { id }) => {
      // Gỡ khỏi cache ngay (không đợi round-trip refetch) để UI phản hồi tức thì.
      qc.setQueryData<ProjectInvite[]>(['my-invites'], (old) =>
        (old ?? []).filter((i) => i.id !== id),
      );
      qc.invalidateQueries({ queryKey: ['my-invites'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
    onSettled: () => setRespondingId(null),
    onError: (e) => Alert.alert('Lỗi', (e as Error).message),
  });

  const pending = (invites ?? []).filter((i) => !dismissedIds.has(i.id));
  if (pending.length === 0) return null;

  const dismissAll = () =>
    setDismissedIds((prev) => new Set([...prev, ...(invites ?? []).map((i) => i.id)]));

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>
            {pending.length === 1 ? 'Bạn có 1 lời mời mới' : `Bạn có ${pending.length} lời mời mới`}
          </Text>
          <Text style={styles.subtitle}>
            Chấp nhận để chính thức tham gia dự án, hoặc từ chối nếu không phù hợp.
          </Text>

          <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
            {pending.map((inv) => (
              <View key={inv.id} style={styles.inviteCard}>
                <Text style={styles.projectName}>{inv.project?.name ?? 'Dự án'}</Text>
                <Text style={styles.meta}>
                  Mời làm {roleLabel[inv.role]}
                  {inv.inviter?.name ? ` · bởi ${inv.inviter.name}` : ''}
                </Text>
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={[styles.declineBtn, respondingId === inv.id && { opacity: 0.5 }]}
                    disabled={respondingId === inv.id}
                    onPress={() => respond.mutate({ id: inv.id, accept: false })}
                  >
                    <Text style={styles.declineText}>Từ chối</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.acceptBtn, respondingId === inv.id && { opacity: 0.5 }]}
                    disabled={respondingId === inv.id}
                    onPress={() => respond.mutate({ id: inv.id, accept: true })}
                  >
                    <Text style={styles.acceptText}>
                      {respondingId === inv.id ? 'Đang xử lý…' : 'Chấp nhận'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity onPress={dismissAll} style={{ marginTop: 4 }}>
            <Text style={styles.dismiss}>Để sau</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 20,
  },
  title: { fontSize: 17, fontWeight: '800', color: colors.text },
  subtitle: { color: colors.textMuted, fontSize: 13, marginTop: 4, marginBottom: 16, lineHeight: 18 },
  inviteCard: {
    backgroundColor: colors.bg,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  projectName: { fontSize: 15, fontWeight: '700', color: colors.text },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  declineBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  declineText: { color: colors.textMuted, fontWeight: '700', fontSize: 13 },
  acceptBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  acceptText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  dismiss: { textAlign: 'center', color: colors.textMuted, fontSize: 13, marginTop: 8 },
});
