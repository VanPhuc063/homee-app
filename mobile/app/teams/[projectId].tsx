import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '@/api/client';
import { Feather } from '@/components/Feather';
import { colors, teamTypeColor, teamTypeIcon } from '@/theme';
import type { TeamOverview } from '@/types';

function todayLabel(): string {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date());
}

export default function TeamsOverview() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();

  const { data: teams, isLoading } = useQuery({
    queryKey: ['teams', projectId],
    queryFn: () => api<TeamOverview[]>(`/projects/${projectId}/teams`),
    enabled: !!projectId,
  });

  const totalPresent = (teams ?? []).reduce((sum, t) => sum + t.presentToday, 0);
  const totalAbsent = (teams ?? []).reduce((sum, t) => sum + t.absentToday, 0);
  const checkedInCount = (teams ?? []).filter((t) => t.checkedInToday).length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Điểm danh hôm nay</Text>
        <Text style={styles.headerDate}>{todayLabel()}</Text>
      </View>

      {isLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}

      {!isLoading && (
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={[styles.summaryValue, { color: colors.success }]}>{totalPresent}</Text>
            <Text style={styles.summaryLabel}>Có mặt</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={[styles.summaryValue, { color: colors.danger }]}>{totalAbsent}</Text>
            <Text style={styles.summaryLabel}>Vắng</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>
              {checkedInCount}/{teams?.length ?? 0}
            </Text>
            <Text style={styles.summaryLabel}>Đội đã ĐD</Text>
          </View>
        </View>
      )}

      {!isLoading && (teams ?? []).length === 0 && (
        <Text style={styles.empty}>Chưa có đội trưởng nào — mời thầu phụ và chọn "Đội trưởng" ở tab Thành viên.</Text>
      )}

      {(teams ?? []).map((t) => {
        const tint = teamTypeColor[t.teamType];
        const absenceNote = t.checkedInToday
          ? t.absentWorkers.length > 0
            ? t.absentWorkers.map((w) => (w.reason ? `${w.name} (${w.reason})` : w.name)).join(', ')
            : 'Đủ'
          : `${t.workerCount} thợ`;
        const borderColor = !t.checkedInToday
          ? colors.locked
          : t.absentWorkers.length > 0
            ? colors.warning
            : colors.success;
        return (
          <View
            key={t.memberId}
            style={[styles.card, { borderLeftColor: borderColor }, !t.checkedInToday && styles.cardDim]}
          >
            <View style={styles.cardHeader}>
              <View style={[styles.teamBadge, { backgroundColor: tint + '1A' }]}>
                <Feather name={teamTypeIcon[t.teamType] as any} size={12} color={tint} />
                <Text style={[styles.teamBadgeText, { color: tint }]}>{t.teamTypeLabel}</Text>
              </View>
              {t.checkedInToday ? (
                <Text style={styles.attendanceBadge}>
                  {t.presentToday}/{t.workerCount}
                </Text>
              ) : (
                <Text style={styles.notCheckedBadge}>Chưa ĐD</Text>
              )}
            </View>
            <Text style={styles.leaderName}>{t.leader.name}</Text>
            <Text style={styles.attendanceText}>
              ĐT: {t.leader.name} · {absenceNote}
            </Text>
            <View style={styles.reportRow}>
              <Feather
                name={t.reportSubmittedToday ? 'check-circle' : 'clock'}
                size={12}
                color={t.reportSubmittedToday ? colors.success : colors.warning}
              />
              <Text style={t.reportSubmittedToday ? styles.statusOk : styles.statusPending}>
                {t.reportSubmittedToday ? 'Đã gửi báo cáo' : 'Chưa gửi báo cáo'}
              </Text>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  headerDate: { fontSize: 13, color: colors.textMuted },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40, lineHeight: 20 },
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 14, marginTop: 12 },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryValue: { fontSize: 22, fontWeight: '800', color: colors.primary },
  summaryLabel: { fontSize: 12, color: colors.textMuted, marginTop: 4, textAlign: 'center' },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
  },
  cardDim: { opacity: 0.5 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  teamBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  teamBadgeText: { fontSize: 12, fontWeight: '700' },
  attendanceBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.success,
    backgroundColor: colors.success + '1A',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  notCheckedBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    backgroundColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  leaderName: { fontWeight: '700', color: colors.text, marginTop: 8 },
  attendanceText: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  reportRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  statusOk: { color: colors.success, fontSize: 12, fontWeight: '700' },
  statusPending: { color: colors.warning, fontSize: 12, fontWeight: '700' },
});
