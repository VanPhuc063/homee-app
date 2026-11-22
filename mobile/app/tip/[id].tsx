import { useQuery } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '@/api/client';
import { colors } from '@/theme';
import type { Tip } from '@/types';

/** Trang đọc 1 bài viết Thông tin, dạng blog — dùng chung cache ['tips'] với danh sách. */
export default function TipScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: tips } = useQuery({ queryKey: ['tips'], queryFn: () => api<Tip[]>('/content/tips') });
  const tip = tips?.find((t) => t.id === id);
  if (!tip) return <View style={styles.container} />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
      <Stack.Screen options={{ title: tip.category ?? 'Bài viết' }} />
      <View style={styles.cover}>
        <Text style={styles.emoji}>{tip.emoji ?? '📘'}</Text>
      </View>
      <View style={styles.content}>
        {!!tip.category && <Text style={styles.tag}>{tip.category}</Text>}
        <Text style={styles.title}>{tip.title}</Text>
        <Text style={styles.meta}>
          {new Date(tip.createdAt).toLocaleDateString('vi-VN')}
          {tip.readMinutes ? ` · ${tip.readMinutes} phút đọc` : ''}
        </Text>
        <View style={styles.divider} />
        {tip.body
          .split(/\n\s*\n/)
          .filter((p) => p.trim())
          .map((p, i) => (
            <Text key={i} style={styles.paragraph}>
              {p.trim()}
            </Text>
          ))}
        {!!tip.linkUrl && (
          <TouchableOpacity style={styles.linkBtn} onPress={() => Linking.openURL(tip.linkUrl!)}>
            <Text style={styles.linkText}>Xem thêm →</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  cover: { height: 200, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 72 },
  content: { padding: 20 },
  tag: { fontSize: 12, fontWeight: '700', color: colors.primary, marginBottom: 6, textTransform: 'uppercase' },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, lineHeight: 30 },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 8 },
  divider: { height: 1, backgroundColor: '#E5E5E5', marginVertical: 18 },
  paragraph: { fontSize: 15, color: colors.text, lineHeight: 25, marginBottom: 14 },
  linkBtn: {
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  linkText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
});
