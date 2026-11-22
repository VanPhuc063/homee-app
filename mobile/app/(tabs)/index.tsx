import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '@/api/client';
import { AdPopup, useAdsAllowed } from '@/ads/Ads';
import { useAuth } from '@/store/auth';
import { colors, roleLabel } from '@/theme';
import type { Project } from '@/types';

export default function Projects() {
  const router = useRouter();
  const { user } = useAuth();
  const adsAllowed = useAdsAllowed();

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/projects'),
  });

  const myRole = (p: Project) => p.members.find((m) => m.userId === user?.id)?.role;
  const progress = (p: Project) => {
    const done = p.phases.filter((ph) => ph.status === 'DONE').length;
    return `${done}/${p.phases.length} hạng mục`;
  };

  return (
    <View style={styles.container}>
      <AdPopup enabled={adsAllowed} />
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
      <FlatList
        data={data ?? []}
        keyExtractor={(p) => p.id}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 90 }}
        ListHeaderComponent={<Text style={styles.hello}>Xin chào, {user?.name}</Text>}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Chưa có công trình nào.{'\n'}Bấm nút bên dưới để tạo dự án đầu tiên, quy trình chuẩn sẽ
            được tạo sẵn theo đúng hình thức hợp đồng bạn chọn.
          </Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => router.push(`/project/${item.id}`)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              {!!item.address && <Text style={styles.cardSub}>{item.address}</Text>}
              <Text style={styles.cardMeta}>
                {progress(item)} · Vai trò: {roleLabel[myRole(item) ?? ''] ?? 'Chưa rõ'}
              </Text>
            </View>
            <Text style={[styles.badge, item.status === 'ACTIVE' && styles.badgeActive]}>
              {item.status}
            </Text>
          </TouchableOpacity>
        )}
      />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => router.push('/create-project')}>
        <Text style={{ color: '#fff', fontWeight: '700' }}>+ Tạo dự án</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hello: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 8 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 60, lineHeight: 22 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  cardSub: { color: colors.textMuted, marginTop: 2 },
  cardMeta: { color: colors.primary, marginTop: 6, fontSize: 13, fontWeight: '600' },
  badge: {
    fontSize: 11,
    color: colors.textMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  badgeActive: { color: colors.success, borderColor: colors.success },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 20,
    left: 16,
    backgroundColor: colors.primary,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
});
