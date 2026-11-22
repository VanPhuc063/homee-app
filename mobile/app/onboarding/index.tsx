import { useMutation } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '@/api/client';
import { Feather } from '@/components/Feather';
import { connectDriveFlow } from '@/googleDrive';
import { colors } from '@/theme';

const TELEGRAM_EVENTS = [
  'Nhà thầu gửi báo cáo mới',
  'Giám sát đánh giá Đạt/Không đạt',
  'Comment mới trên bước thi công',
  'Vật tư mới nhập',
  'AI tổng kết 8 PM hàng ngày',
  'Cảnh báo trễ tiến độ',
];

/** Mockup 02 (Kết nối Google Drive) + 03 (Kết nối Telegram) — hiện 1 lần ngay sau khi đăng ký. */
export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState<'drive' | 'telegram'>('drive');
  const [connecting, setConnecting] = useState(false);

  const connectDrive = async () => {
    setConnecting(true);
    try {
      await connectDriveFlow();
      setStep('telegram');
    } catch (e) {
      Alert.alert('Kết nối Google Drive thất bại', (e as Error).message);
    } finally {
      setConnecting(false);
    }
  };

  const connectTelegram = useMutation({
    mutationFn: () => api<{ deepLink?: string; error?: string }>('/me/telegram-link', { method: 'POST' }),
    onSuccess: async (res) => {
      if (res.error || !res.deepLink) {
        Alert.alert('Chưa dùng được Telegram', res.error ?? 'Server chưa cấu hình Telegram Bot');
        return;
      }
      await Linking.openURL(res.deepLink);
      router.replace('/');
    },
    onError: (e) => Alert.alert('Lỗi', (e as Error).message),
  });

  if (step === 'drive') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={[styles.iconBox, { backgroundColor: '#E8F0FE' }]}>
          <Feather name="folder" size={30} color="#1A73E8" />
        </View>
        <Text style={styles.title}>Kết nối Google Drive</Text>
        <Text style={styles.subtitle}>Tất cả ảnh, video, báo cáo sẽ được tự động đồng bộ vào Drive của bạn</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Cấu trúc thư mục</Text>
          <Text style={styles.tree}>📁 Nhật Ký Thi Công/</Text>
          <Text style={[styles.tree, { paddingLeft: 16 }]}>📁 [Tên dự án]/</Text>
          {['Báo cáo/', 'Ảnh/', 'Video/', 'Vật tư/'].map((f) => (
            <Text key={f} style={[styles.tree, { paddingLeft: 32 }]}>
              📂 {f}
            </Text>
          ))}
        </View>

        <TouchableOpacity style={[styles.button, connecting && { opacity: 0.6 }]} disabled={connecting} onPress={connectDrive}>
          {connecting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Kết nối Google Drive</Text>}
        </TouchableOpacity>
        <Text style={styles.hint}>Chỉ kết nối 1 lần. Dữ liệu tự động đồng bộ sau đó.</Text>
        <View style={styles.noteBox}>
          <Text style={styles.noteText}>
            • Ảnh, video lưu vào Google Drive của chính tài khoản bạn kết nối — app không giữ bản sao.{'\n'}• Drive miễn phí có 15GB. Video chiếm nhiều dung lượng, app tự nén video trước khi tải lên.{'\n'}• Có thể bỏ qua và kết nối sau ở Hồ sơ — cần kết nối trước khi tạo dự án.
          </Text>
        </View>
        <TouchableOpacity onPress={() => setStep('telegram')}>
          <Text style={styles.skip}>Bỏ qua, thiết lập sau →</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={[styles.iconBox, { backgroundColor: '#E3F2FD' }]}>
        <Feather name="send" size={28} color="#229ED9" />
      </View>
      <Text style={styles.title}>Kết nối Telegram</Text>
      <Text style={styles.subtitle}>Nhận thông báo báo cáo, đánh giá, vật tư qua Telegram</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Bạn sẽ nhận thông báo khi:</Text>
        {TELEGRAM_EVENTS.map((e) => (
          <Text key={e} style={styles.event}>
            ✅ {e}
          </Text>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: '#229ED9' }, connectTelegram.isPending && { opacity: 0.6 }]}
        disabled={connectTelegram.isPending}
        onPress={() => connectTelegram.mutate()}
      >
        <Text style={styles.buttonText}>Kết nối Telegram Bot</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.replace('/')}>
        <Text style={styles.skip}>Bỏ qua, thiết lập sau →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, paddingTop: 72, flexGrow: 1 },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
  subtitle: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: 6, marginBottom: 20, lineHeight: 19 },
  card: { borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 10, padding: 14, marginBottom: 20 },
  cardTitle: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 8 },
  tree: { fontSize: 13, color: colors.text, paddingVertical: 2 },
  event: { fontSize: 13, color: colors.text, paddingVertical: 3 },
  button: { backgroundColor: colors.primary, borderRadius: 10, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  hint: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 10 },
  noteBox: { backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12, marginTop: 14 },
  noteText: { fontSize: 12, color: colors.text, lineHeight: 18 },
  skip: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: 16 },
});
