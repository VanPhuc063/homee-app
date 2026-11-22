import { Stack } from 'expo-router';

// Nested layout cho cụm màn đăng nhập (SĐT+OTP chính + email/mật khẩu phụ) — cần layout riêng vì
// "login" giờ là 1 thư mục 2 file (index = SĐT, email) thay vì 1 file đơn như trước.
export default function LoginLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="email" />
    </Stack>
  );
}
