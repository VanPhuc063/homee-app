import LottieView from 'lottie-react-native';
import { StyleSheet } from 'react-native';

/** Hiệu ứng dấu tích xanh xuất hiện — dùng cho các thao tác quan trọng vừa hoàn tất (gửi báo cáo
 * đội, tạo dự án xong...), thay cho icon ✅ tĩnh trước đây. */
export function LottieSuccess({ size = 72 }: { size?: number }) {
  return (
    <LottieView
      source={require('../../assets/lottie/success.json')}
      autoPlay
      loop={false}
      style={[styles.base, { width: size, height: size }]}
    />
  );
}

const styles = StyleSheet.create({
  base: { alignSelf: 'center' },
});
