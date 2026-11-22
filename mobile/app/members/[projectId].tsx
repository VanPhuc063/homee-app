import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';
import { api } from '@/api/client';
import { InviteMembers } from '@/members/InviteMembers';
import { useAuth } from '@/store/auth';
import type { Project } from '@/types';

/** "+ Thêm thành viên mới" ở tab Thành viên — cùng form Mời thành viên của mockup 07. */
export default function AddMember() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const userId = useAuth((s) => s.user?.id);
  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: () => api<Project[]>('/projects') });
  const myRole = projects?.find((p) => p.id === projectId)?.members.find((m) => m.userId === userId)?.role;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      {!!projectId && <InviteMembers projectId={projectId} myRole={myRole} />}
    </ScrollView>
  );
}
