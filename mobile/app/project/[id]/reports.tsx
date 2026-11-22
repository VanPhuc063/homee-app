import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useGlobalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '@/api/client';
import { Feather } from '@/components/Feather';
import { isoDay } from '@/components/DayStrip';
import { mediaThumbUrl } from '@/media';
import { useAuth } from '@/store/auth';
import { colors, stepStatusMeta } from '@/theme';
import type { DailyLogData, Project, ReportFeedItem } from '@/types';

const WEEKDAY = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const dayKey = (iso: string) => new Date(iso).toLocaleDateString('vi-VN');
const time = (iso: string) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const diff = Math.round((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  const name = diff === 0 ? 'Hôm nay' : diff === 1 ? 'Hôm qua' : WEEKDAY[d.getDay()];
  return `${name}, ${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}`;
}

/** Báo cáo dạng timeline — mọi báo cáo bước + điểm danh, mới nhất trước, gom theo ngày. */
export default function ReportTimeline() {
  const { id } = useGlobalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch, isRefetching } = useInfiniteQuery({
    queryKey: ['report-feed', id],
    queryFn: ({ pageParam }) =>
      api<{ items: ReportFeedItem[]; nextBefore: string | null }>(
        `/projects/${id}/report-feed${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled: !!id,
  });
  const items = data?.pages.flatMap((p) => p.items) ?? [];

  // Nút "Báo cáo bước hôm nay": chọn bước đang làm (hoặc bước mở khác) → vào màn bước để up ảnh/ghi %.
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const [picking, setPicking] = useState(false);
  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: () => api<Project[]>('/projects') });
  const myRole = projects?.find((p) => p.id === id)?.members.find((m) => m.userId === user?.id)?.role;
  const isContractor = myRole === 'MAIN_CONTRACTOR' || myRole === 'SUB_CONTRACTOR';
  const today = isoDay(new Date());
  const { data: log } = useQuery({
    queryKey: ['daily-log', id, today],
    queryFn: () => api<DailyLogData>(`/projects/${id}/daily-log?date=${today}`),
    enabled: !!id && picking,
  });
  const pick = useMutation({
    // Chỉ thầu mới "chọn" bước vào nhật ký ngày; chủ nhà/giám sát vào thẳng màn bước.
    mutationFn: async (stepId: string) => {
      if (isContractor) await api(`/steps/${stepId}/daily-log/pick`, { method: 'POST' });
      return stepId;
    },
    onSuccess: (stepId) => {
      setPicking(false);
      qc.invalidateQueries({ queryKey: ['daily-log', id] });
      router.push(`/step/${stepId}`);
    },
    onError: (e) => Alert.alert('Lỗi', (e as Error).message),
  });
  const choices = [
    ...(log?.steps.filter((s) => s.status !== 'APPROVED').map((s) => ({ ...s, active: true })) ?? []),
    ...(log?.pickableSteps.map((s) => ({ ...s, active: false })) ?? []),
  ];

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
      data={items}
      keyExtractor={(i) => i.kind + i.id}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      onEndReached={() => hasNextPage && !isFetchingNextPage && fetchNextPage()}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={
        <>
        <TouchableOpacity style={styles.reportBtn} onPress={() => setPicking((v) => !v)}>
          <Feather name={picking ? 'x' : 'plus'} size={18} color="#fff" />
          <Text style={styles.reportBtnText}>{picking ? 'Đóng' : 'Báo cáo bước hôm nay'}</Text>
        </TouchableOpacity>
        {picking && (
          <View style={styles.pickBox}>
            {!log ? (
              <ActivityIndicator style={{ margin: 12 }} />
            ) : !choices.length ? (
              <Text style={styles.empty}>Không có bước nào đang mở.</Text>
            ) : (
              choices.map((s) => (
                <TouchableOpacity
                  key={s.stepId}
                  style={styles.pickRow}
                  disabled={pick.isPending}
                  onPress={() => (s.active ? (setPicking(false), router.push(`/step/${s.stepId}`)) : pick.mutate(s.stepId))}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickCode}>
                      {s.phaseCode} · {s.phaseName}
                      {s.active ? ' · đang làm' : ''}
                    </Text>
                    <Text style={styles.pickName}>{s.name}</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.primary} />
                </TouchableOpacity>
              ))
            )}
          </View>
        )}
        <TouchableOpacity style={styles.todayBtn} onPress={() => router.push(`/project/${id}/daily-log`)}>
          <Feather name="calendar" size={16} color={colors.primary} />
          <Text style={styles.todayText}>Báo cáo hôm nay / xem theo ngày</Text>
          <Feather name="chevron-right" size={16} color={colors.primary} />
        </TouchableOpacity>
        </>
      }
      ListEmptyComponent={
        isLoading ? <ActivityIndicator style={{ marginTop: 24 }} /> : <Text style={styles.empty}>Chưa có báo cáo nào.</Text>
      }
      ListFooterComponent={isFetchingNextPage ? <ActivityIndicator style={{ marginTop: 8 }} /> : null}
      renderItem={({ item, index }) => {
        const newDay = index === 0 || dayKey(items[index - 1].createdAt) !== dayKey(item.createdAt);
        const isLast = index === items.length - 1 || dayKey(items[index + 1].createdAt) !== dayKey(item.createdAt);
        const checkin = item.kind === 'CHECKIN';
        const failed = !checkin && item.qualityDecision === 'FAILED';
        const dotColor = checkin ? '#2563EB' : failed ? colors.danger : item.qualityDecision === 'PASSED' ? colors.success : colors.primary;
        return (
          <View>
            {newDay && <Text style={styles.day}>{dayLabel(item.createdAt)}</Text>}
            <View style={styles.row}>
              <View style={styles.rail}>
                <View style={[styles.dot, { backgroundColor: dotColor }]} />
                {!isLast && <View style={styles.line} />}
              </View>
              <TouchableOpacity
                style={[styles.card, failed && styles.cardFailed]}
                activeOpacity={0.8}
                disabled={checkin}
                onPress={() => !checkin && router.push(`/step/${item.step.id}`)}
              >
                <View style={styles.metaRow}>
                  <Text style={styles.author} numberOfLines={1}>{item.author.name}</Text>
                  <Text style={styles.time}>{time(item.createdAt)}</Text>
                </View>
                {checkin ? (
                  <>
                    <Text style={styles.title}>👷 Điểm danh {item.workerCount} người</Text>
                    {!!item.note && <Text style={styles.body}>{item.note}</Text>}
                  </>
                ) : (
                  <>
                    <Text style={styles.step} numberOfLines={2}>
                      {item.step.phaseCode} · {item.step.name}
                      {item.step.floorLabel ? ` — ${item.step.floorLabel}` : ''}
                    </Text>
                    {!!item.body && <Text style={styles.body}>{item.body}</Text>}
                    {!!item.evidence && item.evidence.type === 'PHOTO' && (
                      <Image source={{ uri: mediaThumbUrl(item.evidence.objectKey) }} style={styles.photo} contentFit="cover" />
                    )}
                    <View style={styles.tags}>
                      {item.progressPercent != null && <Text style={styles.pct}>{item.progressPercent}%</Text>}
                      {item.qualityDecision && (
                        <Text style={[styles.tag, { color: failed ? colors.danger : colors.success }]}>
                          {failed ? '✗ Không đạt' : '✓ Đạt'}
                        </Text>
                      )}
                      <Text style={[styles.tag, { color: stepStatusMeta[item.step.status]?.color ?? colors.textMuted }]}>
                        {stepStatusMeta[item.step.status]?.label ?? item.step.status}
                      </Text>
                    </View>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 10,
    backgroundColor: colors.primary,
    marginBottom: 8,
  },
  reportBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  pickBox: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, marginBottom: 8 },
  pickRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  pickCode: { fontSize: 11, color: colors.textMuted, fontWeight: '700' },
  pickName: { fontSize: 14, color: colors.text, fontWeight: '600', marginTop: 2 },
  todayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.primaryLight,
    marginBottom: 4,
  },
  todayText: { flex: 1, color: colors.primary, fontWeight: '700', fontSize: 13 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 24 },
  day: { fontSize: 12, fontWeight: '800', color: colors.text, textTransform: 'uppercase', marginTop: 16, marginBottom: 8 },
  row: { flexDirection: 'row' },
  rail: { width: 20, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 14 },
  line: { flex: 1, width: 2, backgroundColor: colors.border, marginTop: 2 },
  card: { flex: 1, borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 10, padding: 12, marginBottom: 10, marginLeft: 6 },
  cardFailed: { borderLeftWidth: 4, borderLeftColor: colors.danger },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  author: { flex: 1, fontSize: 12, fontWeight: '700', color: colors.primary },
  time: { fontSize: 11, color: colors.textMuted },
  title: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 4 },
  step: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: 4 },
  body: { fontSize: 13, color: colors.text, marginTop: 4, lineHeight: 19 },
  photo: { height: 160, borderRadius: 8, marginTop: 8, backgroundColor: colors.bg },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  pct: { fontSize: 12, fontWeight: '800', color: '#2563EB' },
  tag: { fontSize: 12, fontWeight: '600' },
});
