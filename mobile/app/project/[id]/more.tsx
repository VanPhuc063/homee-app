import { useGlobalSearchParams, useRouter } from 'expo-router';
import { Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useQuery } from '@tanstack/react-query';
import { api, dailyLogExportUrl } from '@/api/client';
import { useAuth } from '@/store/auth';
import type { Project } from '@/types';
import { Feather } from '@/components/Feather';
import { colors } from '@/theme';

type Icon = 'dollar-sign' | 'download' | 'file-text' | 'shopping-cart' | 'trending-up' | 'share-2' | 'settings' | 'help-circle';

const SUPPORT_EMAIL = 'tiennln.work@gmail.com';

// Menu tab Thêm — đúng 6 mục của mockup 23. Các màn quản lý dự án khác (kế hoạch, lịch, duyệt vật
// tư, ứng tiền, lỗi, AI đối chiếu...) nằm trong "Quản lý tiến độ" (progress.tsx).
export default function MoreScreen() {
  const { id } = useGlobalSearchParams<{ id: string }>();
  const router = useRouter();

  const user = useAuth((s) => s.user);
  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: () => api<Project[]>('/projects') });
  const myRole = projects?.find((p) => p.id === id)?.members.find((m) => m.userId === user?.id)?.role;
  const canMoney = myRole === 'OWNER' || myRole === 'MAIN_CONTRACTOR';

  const items: { title: string; hint: string; icon: Icon; color: string; tag?: { text: string; color: string }; onPress: () => void }[] = [
    { title: 'Thông tin', hint: 'Kiến thức xây dựng, mẹo hay', icon: 'file-text', color: colors.primary, onPress: () => router.push('/tips') },
    { title: 'Shop vật dụng', hint: 'Sản phẩm xây dựng + link Shopee', icon: 'shopping-cart', color: '#EA580C', onPress: () => router.push('/compare') },
    {
      title: 'Affiliate',
      hint: 'Commission dashboard',
      icon: 'share-2',
      color: colors.affiliate,
      tag: { text: 'Founders', color: colors.affiliate },
      onPress: () => router.push('/affiliate'),
    },
    ...(canMoney
      ? [
          {
            title: 'Thanh toán & phát sinh',
            hint: 'Đợt thanh toán theo tiến độ, chi phí phát sinh, dự toán vs thực tế',
            icon: 'dollar-sign' as Icon,
            color: '#B45309',
            onPress: () => router.push(`/payments/${id}`),
          },
        ]
      : []),
    {
      title: 'Xuất báo cáo PDF',
      hint: 'Nhật ký thi công đầy đủ, gửi khách hàng/chủ đầu tư',
      icon: 'download',
      color: colors.primary,
      onPress: () => WebBrowser.openBrowserAsync(dailyLogExportUrl(id!)),
    },
    { title: 'Cài đặt', hint: 'Tài khoản, gói, Drive, Telegram', icon: 'settings', color: colors.text, onPress: () => router.push('/profile') },
    {
      title: 'Hỗ trợ',
      hint: 'Hướng dẫn sử dụng, liên hệ',
      icon: 'help-circle',
      color: '#2563EB',
      onPress: () =>
        Alert.alert('Hỗ trợ', `Liên hệ đội ngũ Nhật Ký Thi Công qua email:\n${SUPPORT_EMAIL}`, [
          { text: 'Đóng', style: 'cancel' },
          { text: 'Gửi email', onPress: () => Linking.openURL(`mailto:${SUPPORT_EMAIL}`) },
        ]),
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {items.map((it) => (
        <TouchableOpacity key={it.title} style={styles.row} onPress={it.onPress}>
          <Feather name={it.icon} size={20} color={it.color} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{it.title}</Text>
            <Text style={styles.hint}>
              {it.hint}
              {it.tag && <Text style={[styles.tag, { color: it.tag.color }]}>{`   ${it.tag.text}`}</Text>}
            </Text>
          </View>
          <Text style={styles.arrow}>→</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  title: { fontSize: 14, fontWeight: '700', color: colors.text },
  hint: { fontSize: 12, color: colors.text, marginTop: 3 },
  tag: { fontSize: 10, fontWeight: '700' },
  arrow: { fontSize: 16, color: colors.text },
});
