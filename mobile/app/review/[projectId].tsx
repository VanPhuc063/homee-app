import { Feather } from '@/components/Feather';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '@/api/client';
import { colors, roleLabel } from '@/theme';
import type { Project, Review } from '@/types';

function Stars({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity key={n} disabled={!onChange} onPress={() => onChange?.(n)} hitSlop={4}>
          <Feather
            name="star"
            size={22}
            color={n <= value ? colors.warning : colors.border}
            style={n <= value ? { opacity: 1 } : { opacity: 0.5 }}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

function MemberReviewCard({
  projectId,
  memberId,
  name,
  roleText,
  existing,
}: {
  projectId: string;
  memberId: string;
  name: string;
  roleText: string;
  existing?: Review;
}) {
  const qc = useQueryClient();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  const submit = useMutation({
    mutationFn: () =>
      api(`/projects/${projectId}/reviews`, {
        method: 'POST',
        body: { revieweeId: memberId, rating, comment: comment.trim() || undefined },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-reviews', projectId] }),
    onError: (e) => Alert.alert('Không gửi được', (e as Error).message),
  });

  return (
    <View style={styles.card}>
      <Text style={styles.name}>{name}</Text>
      <Text style={styles.roleText}>{roleText}</Text>

      {existing ? (
        <View style={{ marginTop: 10 }}>
          <Stars value={existing.rating} />
          {!!existing.comment && <Text style={styles.existingComment}>{existing.comment}</Text>}
          <Text style={styles.doneTag}>Đã đánh giá</Text>
        </View>
      ) : (
        <View style={{ marginTop: 10 }}>
          <Stars value={rating} onChange={setRating} />
          <TextInput
            style={styles.input}
            placeholder="Nhận xét (tuỳ chọn), chỉ người này thấy được"
            value={comment}
            onChangeText={setComment}
            multiline
          />
          <TouchableOpacity
            style={[styles.submitBtn, submit.isPending && { opacity: 0.6 }]}
            disabled={submit.isPending}
            onPress={() => submit.mutate()}
          >
            <Text style={styles.submitText}>
              {submit.isPending ? 'Đang gửi…' : 'Gửi đánh giá'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function ReviewMembersScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/projects'),
  });
  const project = projects?.find((p) => p.id === projectId);

  const { data: reviews, isLoading } = useQuery({
    queryKey: ['project-reviews', projectId],
    queryFn: () => api<Review[]>(`/projects/${projectId}/reviews`),
    enabled: !!projectId,
  });

  const members = (project?.members ?? []).filter((m) => m.role !== 'OWNER');

  if (project && project.status !== 'DONE') {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>Chỉ đánh giá được sau khi dự án đã hoàn thành.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          Đánh giá giúp thành viên xây dựng uy tín ở tab Khám phá cho các chủ nhà khác. Mỗi thành
          viên chỉ đánh giá được 1 lần, không sửa lại được. Nhận xét chỉ người được đánh giá thấy.
        </Text>
      </View>

      {isLoading && <Text style={styles.empty}>Đang tải…</Text>}
      {members.length === 0 && !isLoading && (
        <Text style={styles.empty}>Dự án không có thành viên nào ngoài chủ nhà.</Text>
      )}
      {members.map((m) => (
        <MemberReviewCard
          key={m.id}
          projectId={projectId!}
          memberId={m.userId}
          name={m.user.name}
          roleText={roleLabel[m.role]}
          existing={reviews?.find((r) => r.revieweeId === m.userId)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  notice: { backgroundColor: colors.primaryLight, borderRadius: 12, padding: 12, marginBottom: 16 },
  noticeText: { color: colors.primary, fontSize: 12, lineHeight: 18 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 20, lineHeight: 20 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  name: { fontWeight: '700', color: colors.text, fontSize: 15 },
  roleText: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    fontSize: 13, color: colors.text,
    marginTop: 10,
    minHeight: 50,
    textAlignVertical: 'top',
  },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  existingComment: { color: colors.text, fontSize: 12, marginTop: 8, lineHeight: 17 },
  doneTag: { color: colors.success, fontWeight: '700', fontSize: 11, marginTop: 8 },
});
