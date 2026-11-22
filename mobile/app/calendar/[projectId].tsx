import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '@/api/client';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Phase, Project } from '@/types';

function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

const STATUS_COLOR: Record<Phase['status'], string> = {
  LOCKED: colors.textMuted,
  IN_PROGRESS: colors.primary,
  DONE: colors.success,
};

const STATUS_LABEL: Record<Phase['status'], string> = {
  LOCKED: 'Chưa bắt đầu',
  IN_PROGRESS: 'Đang thi công',
  DONE: 'Hoàn thành',
};

/**
 * Lịch thi công dạng timeline (Gantt rút gọn) — mỗi hạng mục là 1 thanh ngang trong thẻ riêng,
 * vị trí + độ dài thanh tỷ lệ với plannedStartDate/plannedEndDate so với toàn bộ khoảng thời gian
 * dự án (xem `ProjectsService.attachPlannedDates`, backend). Trước khi duyệt kế hoạch, ngày chỉ
 * là bản xem trước tính từ hôm nay — chưa phải lịch chốt.
 */
export default function ConstructionCalendar() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const router = useRouter();
  const user = useAuth((s) => s.user);

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/projects'),
  });
  const project = projects?.find((p) => p.id === projectId);
  const myRole = project?.members.find((m) => m.userId === user?.id)?.role;

  const { data: phases, isLoading } = useQuery({
    queryKey: ['phases', projectId],
    queryFn: () => api<Phase[]>(`/projects/${projectId}/phases`),
    enabled: !!projectId,
  });

  const ordered = [...(phases ?? [])].sort((a, b) => a.order - b.order);
  const rangeStart = ordered.length ? new Date(ordered[0].plannedStartDate) : null;
  const rangeEnd = ordered.length
    ? new Date(Math.max(...ordered.map((p) => new Date(p.plannedEndDate).getTime())))
    : null;
  const totalDays = rangeStart && rangeEnd ? Math.max(1, daysBetween(rangeStart, rangeEnd)) : 1;
  // Mốc "hôm nay" — chỉ vẽ khi hôm nay còn nằm trong khoảng dự án, để không gây hiểu nhầm nếu dự
  // án chưa bắt đầu hoặc đã kết thúc từ lâu.
  const todayPct = (() => {
    if (!rangeStart || !rangeEnd) return null;
    const pct = (daysBetween(rangeStart, new Date()) / totalDays) * 100;
    return pct >= 0 && pct <= 100 ? pct : null;
  })();

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          {project?.constructionStartDate
            ? `Lịch thi công dự kiến, tính từ ngày duyệt kế hoạch (${formatShortDate(
                project.constructionStartDate,
              )}). Mỗi hạng mục là 1 thanh, độ dài theo số ngày dự kiến.`
            : 'Dự án chưa duyệt kế hoạch, đây là bản xem trước tính từ hôm nay, ngày thật sẽ chốt lúc chủ nhà duyệt kế hoạch.'}
        </Text>
      </View>

      {myRole === 'OWNER' && (
        <TouchableOpacity
          style={styles.inviteBtn}
          onPress={() => router.push(`/project/${projectId}/members`)}
        >
          <Text style={styles.inviteBtnText}>Mời giám sát cho 1 vài hạng mục →</Text>
        </TouchableOpacity>
      )}

      {isLoading && <Text style={styles.empty}>Đang tải…</Text>}
      {!isLoading && ordered.length === 0 && <Text style={styles.empty}>Chưa có hạng mục nào.</Text>}

      {rangeStart && rangeEnd && (
        <View style={styles.axisRow}>
          <Text style={styles.axisLabel}>{formatShortDate(rangeStart.toISOString())}</Text>
          <Text style={styles.axisLabel}>Tổng {totalDays} ngày</Text>
          <Text style={styles.axisLabel}>{formatShortDate(rangeEnd.toISOString())}</Text>
        </View>
      )}
      {todayPct !== null && (
        <View style={styles.legendRow}>
          <View style={styles.legendDash} />
          <Text style={styles.legendText}>Hôm nay</Text>
        </View>
      )}

      {ordered.map((phase) => {
        const start = new Date(phase.plannedStartDate);
        const offsetPct = rangeStart ? (daysBetween(rangeStart, start) / totalDays) * 100 : 0;
        const widthPct = Math.max(2, (phase.plannedDurationDays / totalDays) * 100);
        return (
          <TouchableOpacity
            key={phase.id}
            style={styles.phaseRow}
            activeOpacity={0.7}
            onPress={() => router.push(`/project/${projectId}/progress`)}
          >
            <View style={styles.phaseRowHeader}>
              <Text style={styles.phaseRowTitle} numberOfLines={1}>
                {phase.code}. {phase.name}
              </Text>
              <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[phase.status] }]} />
            </View>
            <View style={styles.trackWrapper}>
              <View style={styles.track}>
                <View
                  style={[
                    styles.bar,
                    {
                      left: `${offsetPct}%`,
                      width: `${widthPct}%`,
                      backgroundColor: STATUS_COLOR[phase.status],
                    },
                  ]}
                />
              </View>
              {todayPct !== null && (
                <View style={[styles.todayLine, { left: `${todayPct}%` }]} />
              )}
            </View>
            <Text style={styles.phaseRowDates}>
              {formatShortDate(phase.plannedStartDate)} → {formatShortDate(phase.plannedEndDate)} ·{' '}
              {phase.plannedDurationDays} ngày · {STATUS_LABEL[phase.status]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  notice: { backgroundColor: colors.primaryLight, borderRadius: 12, padding: 12, marginBottom: 16 },
  inviteBtn: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  inviteBtnText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  noticeText: { color: colors.primary, fontSize: 12, lineHeight: 18 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 12 },
  axisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  axisLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  legendDash: { width: 2, height: 12, borderRadius: 1, backgroundColor: colors.danger },
  legendText: { color: colors.danger, fontSize: 11, fontWeight: '700' },
  phaseRow: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  phaseRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  phaseRowTitle: { flex: 1, color: colors.text, fontSize: 12, fontWeight: '700' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  trackWrapper: { paddingVertical: 3 },
  track: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  bar: { position: 'absolute', top: 0, bottom: 0, borderRadius: 5 },
  todayLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    backgroundColor: colors.danger,
  },
  phaseRowDates: { color: colors.textMuted, fontSize: 11, marginTop: 6 },
});
