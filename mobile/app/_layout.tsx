// Phải import đầu file (side-effect) — yêu cầu bắt buộc của react-native-gesture-handler,
// cần thiết cho thao tác kéo-thả (drag & drop) sắp xếp hạng mục ở màn Kế hoạch thi công.
import 'react-native-gesture-handler';
import '@/polyfills';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { TouchableOpacity } from 'react-native';
import { Feather } from '@/components/Feather';
import { InvitePopup } from '@/components/InvitePopup';
import { registerPushToken } from '@/notifications';
import { startUploadQueue } from '@/offline/uploadQueue';
import { colors } from '@/theme';
import { useAuth } from '@/store/auth';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 15_000 } },
});

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, hydrated, hydrate, justRegistered, setJustRegistered } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated) return;
    const inLogin = segments[0] === 'login';
    if (!user && !inLogin) router.replace('/login');
    if (user && inLogin) {
      router.replace(justRegistered ? '/onboarding' : '/');
      setJustRegistered(false);
    }
  }, [user, hydrated, segments, router, justRegistered, setJustRegistered]);

  // Mở lại app khi đã đăng nhập sẵn (không qua màn login) — làm mới push token phòng khi đổi
  // thiết bị hoặc token cũ hết hạn.
  useEffect(() => {
    if (hydrated && user) registerPushToken();
  }, [hydrated, user]);

  // Gửi lại ảnh/video lưu tạm lúc mất sóng (offline/uploadQueue).
  useEffect(() => {
    if (!hydrated || !user) return;
    return startUploadQueue(() => queryClient.invalidateQueries());
  }, [hydrated, user]);

  if (!hydrated) return null;
  return (
    <>
      {children}
      {/* Chỉ hiện khi đã đăng nhập — component tự query /me/invites, không cần điều kiện thêm ở đây. */}
      {user && <InvitePopup />}
    </>
  );
}

function RootStack() {
  const router = useRouter();
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.primary,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: colors.bg },
        // Nút back "minimal" mặc định của native-stack có bug trên Android: hiện icon nhưng
        // không nhận tap (react-native-screens). Tự vẽ headerLeft bằng router.back() để né,
        // giống cách app/project/[id]/_layout.tsx đã làm cho Tabs.
        headerLeft: ({ canGoBack }) =>
          canGoBack ? (
            <TouchableOpacity
              onPress={() => router.back()}
              hitSlop={12}
              style={{ paddingHorizontal: 12, paddingVertical: 4 }}
            >
              <Feather name="chevron-left" size={26} color={colors.primary} />
            </TouchableOpacity>
          ) : null,
      }}
    >
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding/index" options={{ headerShown: false }} />
      <Stack.Screen name="create-project" options={{ title: 'Tạo dự án' }} />
      {/* project/[id] có layout Tabs riêng (Tiến độ/Thành viên/Nhật ký) — header do Tabs
          tự quản lý (xem app/project/[id]/_layout.tsx), tắt header của Stack ở đây để
          tránh 2 header chồng nhau. */}
      <Stack.Screen name="project/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="step/[id]" options={{ title: 'Chi tiết bước' }} />
      <Stack.Screen name="payments/[projectId]" options={{ title: 'Thanh toán & phát sinh' }} />
      <Stack.Screen name="defects/[projectId]" options={{ title: 'Lỗi & khiếu nại' }} />
      <Stack.Screen name="plan/[projectId]" options={{ title: 'Kế hoạch thi công' }} />
      <Stack.Screen name="calendar/[projectId]" options={{ title: 'Lịch thi công' }} />
      <Stack.Screen name="material-check/[projectId]" options={{ title: 'Duyệt vật tư' }} />
      <Stack.Screen name="material-log/[projectId]" options={{ title: 'Nhật ký vật tư' }} />
      <Stack.Screen name="tip/[id]" options={{ title: 'Bài viết' }} />
      <Stack.Screen name="teams/[projectId]" options={{ title: 'Tổng quan điểm danh' }} />
      <Stack.Screen name="members/[projectId]" options={{ title: 'Mời thành viên' }} />
      <Stack.Screen name="team-checkin/[projectId]" options={{ title: 'Điểm danh & báo cáo đội' }} />
      <Stack.Screen name="ai-schedule-review/[projectId]" options={{ title: 'AI đối chiếu tiến độ' }} />
      <Stack.Screen name="ai-alerts/[projectId]" options={{ title: 'Cảnh báo tiến độ' }} />
      <Stack.Screen name="ai-chat/[projectId]" options={{ title: 'Hỏi AI tư vấn' }} />
      <Stack.Screen name="candidate/[id]" options={{ title: 'Hồ sơ ứng viên' }} />
      <Stack.Screen name="review/[projectId]" options={{ title: 'Đánh giá thành viên' }} />
      <Stack.Screen name="notifications" options={{ title: 'Thông báo' }} />
      <Stack.Screen name="subscription/index" options={{ title: 'Gói & Thanh toán' }} />
      <Stack.Screen name="subscription/owner" options={{ title: 'Bảng giá Chủ nhà' }} />
      <Stack.Screen name="subscription/contractor" options={{ title: 'Bảng giá Nhà thầu' }} />
      <Stack.Screen name="subscription/ai" options={{ title: 'AI Premium' }} />
      <Stack.Screen name="subscription/success" options={{ title: 'Thanh toán thành công', headerBackVisible: false }} />
      <Stack.Screen name="daily-log-phase/[phaseId]" options={{ title: 'Báo cáo hạng mục' }} />
      <Stack.Screen name="affiliate/index" options={{ title: 'Commission' }} />
      <Stack.Screen name="affiliate/withdraw" options={{ title: 'Rút tiền' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AuthGate>
          <StatusBar style="dark" />
          <RootStack />
        </AuthGate>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
