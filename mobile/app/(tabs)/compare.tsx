import { useQuery } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '@/api/client';
import { Feather } from '@/components/Feather';
import { colors } from '@/theme';
import type { Product } from '@/types';

const CATEGORIES = ['Tất cả', 'Dụng cụ', 'Vật liệu', 'An toàn', 'Nội thất'];
const fmt = (n: string | number) => Number(n).toLocaleString('vi-VN') + 'đ';

/** Shop vật dụng — sản phẩm dạng blog + link Shopee (mockup 25). */
export default function ShopScreen() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Tất cả');

  const query = new URLSearchParams({
    ...(category !== 'Tất cả' ? { category } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
  }).toString();
  const { data: products, isLoading } = useQuery({
    queryKey: ['products', category, search.trim()],
    queryFn: () => api<Product[]>(`/products${query ? `?${query}` : ''}`),
  });

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      data={products ?? []}
      keyExtractor={(p) => p.id}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <>
          <Text style={styles.subtitle}>Sản phẩm + link Shopee</Text>
          <View style={styles.searchBox}>
            <Feather name="search" size={16} color={colors.textMuted} />
            <TextInput style={styles.searchInput} placeholder="Tìm sản phẩm..." value={search} onChangeText={setSearch} />
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
      ListEmptyComponent={!isLoading ? <Text style={styles.empty}>Không tìm thấy sản phẩm phù hợp.</Text> : null}
      renderItem={({ item }) => {
        const offer = item.offers.find((o) => o.affiliateUrl) ?? item.offers[0];
        return (
          <View style={styles.card}>
            <Text style={styles.emoji}>{item.emoji ?? '🛠️'}</Text>
            <Text style={styles.name}>{item.name}</Text>
            {!!item.description && <Text style={styles.desc}>{item.description}</Text>}
            {offer && (
              <View style={styles.priceRow}>
                <Text style={styles.price}>{fmt(offer.price)}</Text>
                {!!item.originalPrice && <Text style={styles.original}>{fmt(item.originalPrice)}</Text>}
              </View>
            )}
            {!!offer?.affiliateUrl && (
              <TouchableOpacity onPress={() => Linking.openURL(offer.affiliateUrl!)}>
                <Text style={styles.buy}>🛒 Mua trên Shopee →</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      }}
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
  card: { borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 10, padding: 14, marginBottom: 10 },
  emoji: { fontSize: 22, textAlign: 'center', marginVertical: 14 },
  name: { fontSize: 14, fontWeight: '700', color: colors.text },
  desc: { fontSize: 12, color: colors.text, marginTop: 4, lineHeight: 17 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6 },
  price: { fontSize: 16, fontWeight: '800', color: colors.danger },
  original: { fontSize: 12, color: colors.textMuted, textDecorationLine: 'line-through' },
  buy: { fontSize: 12, color: colors.textMuted, marginTop: 8 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 20 },
});
