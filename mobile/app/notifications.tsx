import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '@/api/client';
import { resolveNotificationRoute } from '@/notificationRoutes';
import { formatRelativeTime } from '@/time';
import { colors } from '@/theme';
import type { Notification } from '@/types';

// Kiểu thẻ theo loại (mockup 10): viền xanh = báo cáo mới, viền đỏ + tiêu đề đỏ = không đạt/lỗi;
// biểu tượng 📦 vật tư, 💬 comment, còn lại hiện chữ cái đầu của người gửi (lấy từ tiêu đề).
function styleFor(type: string): { border?: string; titleColor?: string; emoji?: string } {
  if (['STEP_REJECTED', 'DEFECT_CREATED', 'MATERIAL_CHECK_DECIDED'].includes(type)) return { border: '#FECACA', titleColor: colors.danger };
  if (['STEP_SUBMITTED', 'TEAM_REPORT_SUBMITTED', 'WORKFORCE_REPORT'].includes(type)) return { border: '#BBF7D0' };
  if (type.startsWith('MATERIAL')) return { emoji: '📦' };
  if (type === 'AI_DAILY_SUMMARY') return { emoji: '✨' };
  if (type.includes('COMMENT') || type === 'REVIEW_RECEIVED') return { emoji: '💬' };
  return {};
}

const initials = (title: string) => {
  const name = title.split(/ (đã|đánh|gửi|mời|duyệt|từ chối|bình luận)/)[0];
  const words = name.trim().split(/s+/).filter((w) => /^[A-ZÀ-Ỹ]/.test(w));
  return words.length >= 2 ? (words[0][0] + words[words.length - 1][0]).toUpperCase() : '';
};

export default function NotificationsScreen() {
  const qc = useQueryClient();
  const router = useRouter();
  const [markingAll, setMarkingAll] = useState(false);

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<Notification[]>('/me/notifications'),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api(`/me/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => api('/me/notifications/read-all', { method: 'PATCH' }),
    onMutate: () => setMarkingAll(true),
    onSettled: () => setMarkingAll(false),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    },
  });

  const items = data ?? [];
  const unreadCount = items.filter((n) => !n.read).length;
  const hasUnread = unreadCount > 0;

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshing={isRefetching}
        onRefresh={refetch}
        ListHeaderComponent={
          <View style={styles.headerRow}>
            <Text style={styles.newCount}>{unreadCount} thông báo mới</Text>
            {hasUnread && (
              <TouchableOpacity disabled={markingAll} onPress={() => markAllRead.mutate()}>
                <Text style={styles.markAllText}>{markingAll ? 'Đang đánh dấu…' : 'Đánh dấu đã đọc'}</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        ListEmptyComponent={
          !isLoading ? <Text style={styles.empty}>Chưa có thông báo nào.</Text> : null
        }
        renderItem={({ item }) => {
          const route = resolveNotificationRoute(item);
          const st = styleFor(item.type);
          const avatar = st.emoji ?? initials(item.title);
          return (
            <TouchableOpacity
              style={[styles.card, st.border ? { borderColor: st.border } : null, !item.read && !st.border && styles.cardUnread]}
              onPress={() => {
                if (!item.read) markRead.mutate(item.id);
                if (route) router.push(route);
              }}
            >
              <Text style={[styles.avatar, !!st.emoji && styles.avatarEmoji]}>{avatar}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, st.titleColor ? { color: st.titleColor } : null]}>{item.title}</Text>
                <Text style={styles.body} numberOfLines={3}>
                  {item.body}
                </Text>
                <Text style={styles.time}>{formatRelativeTime(item.createdAt)}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  newCount: { fontSize: 13, color: colors.textMuted },
  markAllText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 60 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1.5,
    borderColor: '#E5E5E5',
  },
  cardUnread: { backgroundColor: '#FAFAFA' },
  avatar: { width: 28, fontSize: 11, fontWeight: '700', color: colors.textMuted, textAlign: 'center', marginTop: 2 },
  avatarEmoji: { fontSize: 14 },
  title: { fontSize: 15, fontWeight: '600', color: colors.text },
  body: { color: colors.text, fontSize: 12, marginTop: 4, lineHeight: 17 },
  time: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
});
