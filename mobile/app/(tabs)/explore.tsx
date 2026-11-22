import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '@/api/client';
import { colors, roleLabel } from '@/theme';
import type { Candidate, ProjectRole } from '@/types';

const ROLE_FILTERS: ProjectRole[] = ['MAIN_CONTRACTOR', 'SUB_CONTRACTOR', 'SUPERVISOR'];

export default function Explore() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<ProjectRole | null>(null);

  const query = new URLSearchParams({
    ...(role ? { role } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
  }).toString();

  const { data: candidates, isLoading } = useQuery({
    queryKey: ['directory-candidates', role, search.trim()],
    queryFn: () => api<Candidate[]>(`/directory/candidates${query ? `?${query}` : ''}`),
  });

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      data={candidates ?? []}
      keyExtractor={(c) => c.id}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View>
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              Chưa quen thầu hay giám sát cụ thể nào? Duyệt danh sách người đã chủ động bật "Sẵn
              sàng nhận việc". Hồ sơ chỉ hiện điểm đánh giá và số dự án đã hoàn thành, không lộ
              SĐT hay thông tin công trình cụ thể cho tới khi cả 2 bên đồng ý tham gia dự án chung.
            </Text>
          </View>

          <TextInput
            style={styles.search}
            placeholder="Tìm theo tên…"
            value={search}
            onChangeText={setSearch}
          />

          <View style={styles.chipRow}>
            <TouchableOpacity
              style={[styles.chip, !role && styles.chipActive]}
              onPress={() => setRole(null)}
            >
              <Text style={[styles.chipText, !role && styles.chipTextActive]}>Tất cả</Text>
            </TouchableOpacity>
            {ROLE_FILTERS.map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.chip, role === r && styles.chipActive]}
                onPress={() => setRole(role === r ? null : r)}
              >
                <Text style={[styles.chipText, role === r && styles.chipTextActive]}>
                  {roleLabel[r]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {isLoading && <Text style={styles.empty}>Đang tải…</Text>}
        </View>
      }
      ListEmptyComponent={
        !isLoading ? (
          <Text style={styles.empty}>Chưa có ai phù hợp, thử đổi bộ lọc.</Text>
        ) : null
      }
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.7}
          onPress={() => router.push(`/candidate/${item.id}`)}
        >
          <View style={styles.cardTop}>
            <Text style={styles.name}>{item.name}</Text>
            {item.avgRating != null && (
              <Text style={styles.rating}>
                ★ {item.avgRating.toFixed(1)} ({item.reviewCount})
              </Text>
            )}
          </View>
          <View style={styles.rolesRow}>
            {item.offeredRoles.map((r) => (
              <Text key={r} style={styles.roleChip}>
                {roleLabel[r]}
              </Text>
            ))}
          </View>
          {!!item.serviceArea && <Text style={styles.meta}>Khu vực: {item.serviceArea}</Text>}
          {item.completedProjects.length > 0 && (
            <Text style={styles.meta}>
              Đã hoàn thành:{' '}
              {item.completedProjects
                .map((c) => `${c.count} dự án (${roleLabel[c.role]})`)
                .join(' · ')}
            </Text>
          )}
          {!!item.bio && (
            <Text style={styles.bio} numberOfLines={2}>
              {item.bio}
            </Text>
          )}
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  notice: { backgroundColor: colors.primaryLight, borderRadius: 12, padding: 12, marginBottom: 14 },
  noticeText: { color: colors.primary, fontSize: 12, lineHeight: 18 },
  search: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 14, color: colors.text,
    marginBottom: 10,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, color: colors.text },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontWeight: '700', color: colors.text, fontSize: 15 },
  rating: { color: colors.warning, fontWeight: '700', fontSize: 13 },
  rolesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  roleChip: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: colors.primaryLight,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 6 },
  bio: { color: colors.text, fontSize: 12, marginTop: 6, lineHeight: 17 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 20, lineHeight: 20 },
});
