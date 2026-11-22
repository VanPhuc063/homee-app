import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '@/api/client';
import { Feather } from '@/components/Feather';
import { colors } from '@/theme';
import type { Tip } from '@/types';

const CATEGORIES = ['Tất cả', 'Phần thô', 'Hoàn thiện', 'Mẹo hay'];

const fmtTipDate = (iso: string) => new Date(iso).toLocaleDateString('vi-VN');

/** Thông tin — kiến thức xây dựng dạng blog (mockup 24). Bấm bài để mở trang đọc đầy đủ (tip/[id]). */
export default function TipsScreen() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Tất cả');
  const { data: tips, isLoading } = useQuery({ queryKey: ['tips'], queryFn: () => api<Tip[]>('/content/tips') });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (tips ?? []).filter(
      (t) =>
        (category === 'Tất cả' || t.category === category) &&
        (!q || t.title.toLowerCase().includes(q) || t.body.toLowerCase().includes(q)),
    );
  }, [tips, search, category]);

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      data={filtered}
      keyExtractor={(t) => t.id}
      ListHeaderComponent={
        <>
          <Text style={styles.subtitle}>Kiến thức xây dựng</Text>
          <View style={styles.searchBox}>
            <Feather name="search" size={16} color={colors.textMuted} />
            <TextInput style={styles.searchInput} placeholder="Tìm bài viết..." value={search} onChangeText={setSearch} />
          </View>
          <View style={styles.catRow}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity key={c} onPress={() => setCategory(c)}>
                <Text style={[styles.cat, category === c && styles.catOn]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      }
      ListEmptyComponent={!isLoading ? <Text style={styles.empty}>Chưa có bài viết nào.</Text> : null}
      renderItem={({ item }) => (
        <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={() => router.push(`/tip/${item.id}`)}>
          <View style={styles.cover}>
            <Text style={styles.emoji}>{item.emoji ?? '📘'}</Text>
          </View>
          <View style={styles.cardBody}>
            {!!item.category && <Text style={styles.tag}>{item.category}</Text>}
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.excerpt} numberOfLines={2}>
              {item.body}
            </Text>
            <Text style={styles.meta}>
              {fmtTipDate(item.createdAt)}
              {item.readMinutes ? ` · ${item.readMinutes} phút đọc` : ''}
            </Text>
          </View>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  subtitle: { fontSize: 12, color: colors.textMuted, marginBottom: 12 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#E5E5E5',
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: colors.text },
  catRow: { flexDirection: 'row', gap: 20, marginVertical: 14, paddingHorizontal: 4 },
  cat: { fontSize: 12, color: colors.text },
  catOn: { color: colors.primary, fontWeight: '700' },
  card: { borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 12, marginBottom: 14, overflow: 'hidden' },
  cover: { height: 110, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 44 },
  cardBody: { padding: 14 },
  tag: { fontSize: 11, fontWeight: '700', color: colors.primary, marginBottom: 4 },
  title: { fontSize: 16, fontWeight: '700', color: colors.text, lineHeight: 22 },
  excerpt: { fontSize: 13, color: colors.textMuted, lineHeight: 19, marginTop: 6 },
  meta: { fontSize: 11, color: colors.textMuted, marginTop: 8 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 20 },
});
