import { useQuery } from '@tanstack/react-query';
import { Feather } from '@/components/Feather';
import { Tabs } from 'expo-router';
import { api } from '@/api/client';
import { NotificationBell } from '@/components/NotificationBell';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Project } from '@/types';

export default function TabsLayout() {
  const user = useAuth((s) => s.user);
  // Tab "Đội của tôi" chỉ có ý nghĩa với ai đang/từng làm thầu chính ở ít nhất 1 dự án — ẩn đi với
  // user chỉ có nhu cầu làm chủ nhà để đỡ rối, thay vì hiện mặc định cho mọi người.
  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/projects'),
  });
  const isContractor = (projects ?? []).some((p) =>
    p.members.some((m) => m.userId === user?.id && m.role === 'MAIN_CONTRACTOR'),
  );

  return (
    <Tabs
      screenOptions={{
        headerTintColor: colors.primary,
        headerTitleStyle: { fontWeight: '600' },
        headerShadowVisible: false,
        headerRight: () => <NotificationBell />,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarStyle: { borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Công trình của tôi',
          tabBarLabel: 'Công trình',
          tabBarIcon: ({ color, size }) => <Feather name="home" size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="compare"
        options={{
          title: 'Shop vật dụng',
          tabBarLabel: 'So sánh giá',
          // Product bỏ khỏi thanh tab (2026-10-06); route vẫn giữ — Shop vật dụng ở tab Thêm của dự án vẫn mở /compare.
          href: null,
          tabBarIcon: ({ color, size }) => <Feather name="tag" size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tips"
        options={{
          title: 'Thông tin',
          tabBarLabel: 'Thông tin',
          tabBarIcon: ({ color, size }) => <Feather name="book-open" size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Khám phá thầu & giám sát',
          tabBarLabel: 'Khám phá',
          // Product bỏ khỏi thanh tab (2026-10-06); route vẫn giữ — Shop vật dụng ở tab Thêm của dự án vẫn mở /compare.
          href: null,
          tabBarIcon: ({ color, size }) => <Feather name="search" size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="crew"
        options={{
          title: 'Đội của tôi',
          tabBarLabel: 'Đội của tôi',
          tabBarIcon: ({ color, size }) => <Feather name="users" size={size - 2} color={color} />,
          href: isContractor ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Hồ sơ',
          tabBarLabel: 'Hồ sơ',
          tabBarIcon: ({ color, size }) => <Feather name="user" size={size - 2} color={color} />,
        }}
      />
    </Tabs>
  );
}
