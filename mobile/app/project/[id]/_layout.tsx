import { Feather } from '@/components/Feather';
import { Tabs, useLocalSearchParams, useRouter } from 'expo-router';
import { ProjectChat } from '@/chat/ProjectChat';
import { Text, TouchableOpacity, View } from 'react-native';
import { usePendingUploads } from '@/offline/uploadQueue';
import { colors } from '@/theme';

/**
 * Tab bar riêng cho 1 dự án. "index" (Dashboard) đứng đầu vì đó là route mà mọi nơi trong app
 * push vào khi vào 1 dự án (`router.push(\`/project/${id}\`)` luôn resolve về file "index" theo
 * quy ước Expo Router) — nên trang tổng quan phải nằm ở đây để là trang đầu tiên người dùng thấy,
 * đúng theo mockup product team. "Tiến độ" (chi tiết từng bước) đổi tên file thành "progress" để
 * nhường "index" cho Dashboard. Ứng tiền/Lỗi/Duyệt vật tư/Kế hoạch phụ thuộc trạng thái nên để
 * dạng nút hành động theo ngữ cảnh ngay trong tab Tiến độ, thay vì nhồi hết vào đây.
 *
 * Màn này được push từ danh sách dự án (Stack), Stack cha (`app/_layout.tsx`) đã tắt header
 * riêng của nó cho route "project/[id]" để tránh 2 header chồng nhau — NHƯNG khác với Stack,
 * Tabs navigator KHÔNG tự thêm nút back vào header của mình. Phải tự thêm headerLeft thủ công,
 * nếu không người dùng bị kẹt trong màn này, không có đường quay lại danh sách dự án / tab Hồ sơ.
 *
 * "Nhật ký ngày" (daily-log) là tính năng MỚI khác hẳn "Hoạt động" (diary, đổi tên từ "Nhật ký"
 * cũ) — dễ nhầm vì tên gốc gần giống nhau: "Hoạt động" là nhật ký hệ thống tự ghi (duyệt bước, lỗi
 * mới...), còn "Nhật ký ngày" là báo cáo công trường theo từng ngày/từng việc (ảnh, % tiến độ,
 * đánh giá kỹ thuật) — xem SchedulingService.getDailyLog.
 */
export default function ProjectTabsLayout() {
  const router = useRouter();
  const pending = usePendingUploads();
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <View style={{ flex: 1 }}>
    {pending > 0 && (
      <View style={{ backgroundColor: '#FFFBEB', paddingVertical: 6, paddingHorizontal: 16 }}>
        <Text style={{ fontSize: 12, color: '#B45309' }}>⏳ {pending} mục đang chờ mạng để gửi — tự gửi khi có sóng</Text>
      </View>
    )}
    <Tabs
      screenOptions={{
        headerTintColor: colors.primary,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
        headerLeft: () => (
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={12}
            style={{ paddingHorizontal: 12, paddingVertical: 4 }}
          >
            <Feather name="chevron-left" size={26} color={colors.primary} />
          </TouchableOpacity>
        ),
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarStyle: { borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({ color, size }) => <Feather name="home" size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Báo cáo',
          tabBarLabel: 'Báo cáo',
          tabBarIcon: ({ color, size }) => <Feather name="check-square" size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="materials"
        options={{
          title: 'Vật tư',
          tabBarLabel: 'Vật tư',
          tabBarIcon: ({ color, size }) => <Feather name="package" size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="members"
        options={{
          title: 'Thành viên',
          tabBarLabel: 'Thành viên',
          tabBarIcon: ({ color, size }) => <Feather name="users" size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'Thêm',
          tabBarLabel: 'Thêm',
          tabBarIcon: ({ color, size }) => <Feather name="more-horizontal" size={size - 2} color={color} />,
        }}
      />
      {/* Ẩn khỏi thanh tab nhưng vẫn mở được qua màn Thêm (mockup chỉ có 5 tab). */}
      <Tabs.Screen name="progress" options={{ href: null, title: 'Quản lý tiến độ' }} />
      <Tabs.Screen name="daily-log" options={{ href: null, title: 'Báo cáo theo ngày' }} />
      <Tabs.Screen name="diary" options={{ href: null, title: 'Hoạt động dự án' }} />
    </Tabs>
    {!!id && <ProjectChat projectId={id} />}
    </View>
  );
}
