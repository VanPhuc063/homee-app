import { Feather } from '@/components/Feather';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '@/api/client';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';

/** Icon chuông ở header các tab chính — hiện chấm đỏ + số khi có thông báo chưa đọc, bấm vào mở
 * màn Thông báo. Poll mỗi 30s cho đơn giản (MVP, chưa cần realtime/websocket). */
export function NotificationBell() {
  const router = useRouter();
  const user = useAuth((s) => s.user);

  const { data } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: () => api<{ count: number }>('/me/notifications/unread-count'),
    enabled: !!user,
    refetchInterval: 30_000,
  });
  const count = data?.count ?? 0;

  return (
    <TouchableOpacity
      onPress={() => router.push('/notifications')}
      hitSlop={12}
      style={styles.wrap}
    >
      <Feather name="bell" size={21} color={colors.text} />
      {count > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { marginRight: 16, padding: 2 },
  badge: {
    position: 'absolute',
    top: -3,
    right: -5,
    backgroundColor: colors.danger,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
});
