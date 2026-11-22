import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useGlobalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '@/api/client';
import { DayStrip, isoDay } from '@/components/DayStrip';
import { PromoBanner, SponsoredBanner, useAdsAllowed } from '@/ads/Ads';
import { Feather } from '@/components/Feather';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { DailyLogData, DailyLogStep, PickableStep, Project } from '@/types';

const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

interface PhaseGroup {
  phaseId: string;
  phaseCode: string;
  phaseName: string;
  steps: DailyLogStep[];
}

// Gộp các bước đang báo cáo theo hạng mục — mỗi thẻ là 1 hạng mục (mockup 12), bấm vào mới thấy
// từng bước nhỏ ở màn chi tiết hạng mục.
function groupByPhase(steps: DailyLogStep[]): PhaseGroup[] {
  const map = new Map<string, PhaseGroup>();
  for (const s of steps) {
    if (!map.has(s.phaseId)) {
      map.set(s.phaseId, { phaseId: s.phaseId, phaseCode: s.phaseCode, phaseName: s.phaseName, steps: [] });
    }
    map.get(s.phaseId)!.steps.push(s);
  }
  return [...map.values()];
}

export default function DailyLogScreen() {
  // "date" optional — mở từ màn khác kèm ngày thì vào đúng ngày đó.
  const { id: projectId, date: dateParam } = useGlobalSearchParams<{ id: string; date?: string }>();
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(() => dateParam || isoDay(new Date()));
  const [showPicker, setShowPicker] = useState(false);

  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: () => api<Project[]>('/projects') });
  const project = projects?.find((p) => p.id === projectId);
  const myRole = project?.members.find((m) => m.userId === user?.id)?.role;
  const isContractor = myRole === 'MAIN_CONTRACTOR' || myRole === 'SUB_CONTRACTOR';
  const adsAllowed = useAdsAllowed(myRole);

  const { data: log, isLoading } = useQuery({
    queryKey: ['daily-log', projectId, selectedDate],
    queryFn: () => api<DailyLogData>(`/projects/${projectId}/daily-log?date=${selectedDate}`),
    enabled: !!projectId,
  });

  // Thầu tự chọn hôm nay báo cáo việc gì (SchedulingService.pickStepForDailyLog).
  const pickStep = useMutation({
    mutationFn: (stepId: string) => api(`/steps/${stepId}/daily-log/pick`, { method: 'POST' }),
    onSuccess: () => {
      setShowPicker(false);
      qc.invalidateQueries({ queryKey: ['daily-log', projectId] });
    },
    onError: (e) => Alert.alert('Lỗi', (e as Error).message),
  });

  const isToday = selectedDate === isoDay(new Date());
  const groups = log ? groupByPhase(log.steps) : [];
  const d = new Date(selectedDate + 'T00:00:00.000Z');
  const dateLabel = `${WEEKDAY[d.getUTCDay()]}, ${d.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  })}`;
  const canAdd = isContractor && isToday && !!log?.pickableSteps.length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.stripWrap}>
        <DayStrip selectedDate={selectedDate} onSelect={setSelectedDate} />
      </View>

      <View style={{ padding: 16 }}>
        <Text style={styles.dateLine}>
          📅 {dateLabel} — {groups.length} bước đang làm
        </Text>

        {isLoading && <Text style={styles.empty}>Đang tải…</Text>}
        {/* Bước chỉ mở khi chủ nhà duyệt kế hoạch — trước đó không có gì để báo cáo, nói rõ thay vì để trống. */}
        {project?.status === 'PLANNING' ? (
          <View style={styles.planCard}>
            <Text style={styles.planTitle}>Dự án đang lập kế hoạch</Text>
            <Text style={styles.planBody}>
              {myRole === 'OWNER'
                ? 'Chưa có bước nào bắt đầu thi công. Duyệt kế hoạch để mở bước đầu tiên — sau đó nhà thầu/đội trưởng báo cáo từng bước tại đây.'
                : 'Chưa có bước nào bắt đầu thi công. Chủ nhà cần duyệt kế hoạch để mở bước đầu tiên, sau đó bạn báo cáo từng bước tại đây.'}
            </Text>
            <TouchableOpacity style={styles.planBtn} onPress={() => router.push(`/plan/${projectId}`)}>
              <Text style={styles.planBtnText}>{myRole === 'OWNER' ? 'Xem & duyệt kế hoạch' : 'Xem kế hoạch thi công'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          log &&
          groups.length === 0 && (
            <Text style={styles.empty}>
              {canAdd
                ? 'Chưa có báo cáo nào trong ngày — bấm "+ Thêm báo cáo bước mới".'
                : isContractor && !isToday
                  ? 'Không có báo cáo nào trong ngày này. Chọn hôm nay để thêm báo cáo.'
                  : isContractor
                    ? 'Chưa có bước nào đang mở để báo cáo.'
                    : 'Không có báo cáo nào trong ngày này. Nhà thầu/đội trưởng báo cáo, bạn xem và bình luận tại đây.'}
            </Text>
          )
        )}

        {groups.map((g, gi) => {
          const done = g.steps.filter((s) => s.status === 'APPROVED').length;
          const total = g.steps.length;
          const rejected = g.steps.some((s) => s.status === 'REJECTED');
          const photos = g.steps.reduce((sum, s) => sum + s.photoCountToday, 0);
          const videos = g.steps.reduce((sum, s) => sum + s.videoCountToday, 0);
          const comments = g.steps.reduce((sum, s) => sum + s.reports.length, 0);
          const floor = g.steps.find((s) => s.floorLabel)?.floorLabel;
          return (
            <View key={g.phaseId}>
            {/* Banner xen giữa danh sách (mockup 37): Tài trợ sau thẻ 1, Khuyến mãi sau thẻ 2. */}
            {adsAllowed && gi === 1 && <SponsoredBanner />}
            {adsAllowed && gi === 2 && <PromoBanner />}
            <TouchableOpacity
              style={[styles.card, rejected && styles.cardRejected]}
              activeOpacity={0.8}
              onPress={() =>
                router.push({
                  pathname: '/daily-log-phase/[phaseId]',
                  params: { phaseId: g.phaseId, projectId: projectId!, date: selectedDate },
                })
              }
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {g.phaseCode}: {g.phaseName}
                </Text>
                {!!floor && <Text style={styles.floor}>{floor}</Text>}
              </View>
              <Text style={styles.cardSub}>
                {total} bước nhỏ — {done}/{total}
                {done > 0 && done < total ? ' hoàn thành' : ''}
              </Text>
              {(photos > 0 || videos > 0 || comments > 0) && (
                <View style={styles.statsRow}>
                  {photos > 0 && <Text style={styles.stat}>📷 {photos}</Text>}
                  {videos > 0 && <Text style={styles.stat}>🎥 {videos}</Text>}
                  {comments > 0 && <Text style={styles.stat}>💬 {comments}</Text>}
                </View>
              )}
              {rejected && <Text style={styles.rejected}>⚠️ Không đạt</Text>}
            </TouchableOpacity>
            </View>
          );
        })}

        {canAdd && (
          <TouchableOpacity onPress={() => setShowPicker((v) => !v)}>
            <Text style={styles.addText}>{showPicker ? 'Đóng' : '+ Thêm báo cáo bước mới'}</Text>
          </TouchableOpacity>
        )}
        {showPicker &&
          log?.pickableSteps.map((s: PickableStep) => (
            <TouchableOpacity
              key={s.stepId}
              style={styles.pickRow}
              disabled={pickStep.isPending}
              onPress={() => pickStep.mutate(s.stepId)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.pickCode}>
                  {s.phaseCode} · {s.phaseName}
                </Text>
                <Text style={styles.pickName}>{s.name}</Text>
              </View>
              <Feather name="plus-circle" size={18} color={colors.primary} />
            </TouchableOpacity>
          ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  stripWrap: { paddingHorizontal: 8, paddingTop: 10 },
  dateLine: { fontSize: 12, fontWeight: '800', color: colors.text, marginBottom: 10, textTransform: 'uppercase' },
  planCard: { borderWidth: 1, borderColor: '#FDE68A', backgroundColor: '#FFFBEB', borderRadius: 10, padding: 14, marginTop: 4 },
  planTitle: { fontSize: 14, fontWeight: '800', color: '#B45309' },
  planBody: { fontSize: 13, color: colors.text, marginTop: 6, lineHeight: 19 },
  planBtn: { backgroundColor: colors.primary, borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 12 },
  planBtnText: { color: '#fff', fontWeight: '700' },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  cardRejected: { borderLeftWidth: 4, borderLeftColor: colors.danger },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  floor: { fontSize: 11, fontWeight: '700', color: '#2563EB' },
  cardSub: { fontSize: 13, color: colors.text, marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: 14, marginTop: 10 },
  stat: { fontSize: 12, color: '#2563EB', fontWeight: '600' },
  rejected: { fontSize: 12, color: colors.danger, fontWeight: '700', marginTop: 8 },
  addText: {
    textAlign: 'center',
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 13,
    marginTop: 10,
    paddingVertical: 8,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 10,
    marginTop: 8,
  },
  pickCode: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  pickName: { fontSize: 13, fontWeight: '600', color: colors.text, marginTop: 2 },
});
