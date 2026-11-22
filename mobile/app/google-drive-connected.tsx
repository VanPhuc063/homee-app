import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme';

/**
 * `expo-web-browser`'s `openAuthSessionAsync` (xem src/googleDrive.ts) LẼ RA sẽ tự bắt redirect
 * `homeee://google-drive-connected` và đóng tab trong lúc còn ở màn gọi `connectDriveFlow`, không
 * bao giờ để app thực sự điều hướng tới route này. Nhưng trên 1 số máy Android, hệ điều hướng vẫn
 * mở thẳng route qua deep link (MainActivity nhận trước WebBrowser) — route này tồn tại để không
 * bị màn "Unmatched Route" trong trường hợp đó, tự làm mới danh sách rồi quay lại Hồ sơ.
 */
export default function GoogleDriveConnected() {
  const qc = useQueryClient();

  useEffect(() => {
    qc.invalidateQueries({ queryKey: ['drive-accounts'] });
    const t = setTimeout(() => router.replace('/(tabs)/profile'), 800);
    return () => clearTimeout(t);
  }, [qc]);

  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={styles.text}>Đã kết nối Google Drive, đang quay lại…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, gap: 16 },
  text: { color: colors.textMuted, fontSize: 14 },
});
