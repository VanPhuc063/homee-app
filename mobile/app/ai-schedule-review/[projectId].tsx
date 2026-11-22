import { useQuery } from '@tanstack/react-query';
import { AiGate } from '@/ai/AiLocked';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '@/api/client';
import { Feather } from '@/components/Feather';
import { MarkdownText } from '@/components/MarkdownText';
import { colors } from '@/theme';
import type { AiScheduleReview, AiScheduleReviewRow } from '@/types';

const STATUS_META: Record<AiScheduleReviewRow['status'], { label: string; color: string }> = {
  NOT_STARTED: { label: 'Chưa bắt đầu', color: colors.locked },
  ON_TIME: { label: 'Đúng hạn', color: colors.success },
  DELAYED: { label: 'Trễ', color: colors.danger },
  AHEAD: { label: 'Sớm', color: '#2563EB' },
  DONE: { label: 'Hoàn thành', color: colors.success },
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function AiScheduleReviewInner() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['ai-schedule-review', projectId],
    queryFn: () => api<AiScheduleReview>(`/projects/${projectId}/ai/schedule-review`),
    enabled: !!projectId,
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={styles.hint}>
        AI so sánh kế hoạch với tiến độ thực tế, trích lý do trễ từ báo cáo/bình luận gần đây của
        thầu.
      </Text>

      {isLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}
      {!!error && <Text style={styles.errorText}>{(error as Error).message}</Text>}

      {data && (
        <>
          <View style={styles.countRow}>
            <View style={[styles.countCard, { backgroundColor: colors.success + '1A' }]}>
              <Text style={[styles.countValue, { color: colors.success }]}>{data.counts.onTime}</Text>
              <Text style={styles.countLabel}>Đúng hạn</Text>
            </View>
            <View style={[styles.countCard, { backgroundColor: colors.danger + '1A' }]}>
              <Text style={[styles.countValue, { color: colors.danger }]}>{data.counts.delayed}</Text>
              <Text style={styles.countLabel}>Trễ</Text>
            </View>
            <View style={[styles.countCard, { backgroundColor: '#2563EB1A' }]}>
              <Text style={[styles.countValue, { color: '#2563EB' }]}>{data.counts.ahead}</Text>
              <Text style={styles.countLabel}>Sớm</Text>
            </View>
            <View style={[styles.countCard, { backgroundColor: colors.bg }]}>
              <Text style={[styles.countValue, { color: colors.textMuted }]}>{data.counts.notStarted}</Text>
              <Text style={styles.countLabel}>Chưa BĐ</Text>
            </View>
          </View>

          {data.rows.map((r) => {
            const meta = STATUS_META[r.status];
            return (
              <View key={r.phaseCode} style={[styles.card, { borderLeftColor: meta.color }]}>
                <View style={styles.cardHeader}>
                  <Text style={styles.phaseTitle}>
                    {r.phaseCode}: {r.phaseName}
                  </Text>
                  <Text style={[styles.statusChip, { color: meta.color, backgroundColor: meta.color + '1A' }]}>
                    {r.status === 'DELAYED' ? `Trễ ${r.delayDays} ngày` : meta.label}
                  </Text>
                </View>
                {(r.plannedStart || r.actualStart) && (
                  <Text style={styles.dateText}>
                    KH: {fmtDate(r.plannedStart)} → {fmtDate(r.plannedEnd)} | TT: {fmtDate(r.actualStart)} →{' '}
                    {r.actualEnd ? fmtDate(r.actualEnd) : 'đang làm'}
                  </Text>
                )}
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${r.percentComplete}%`, backgroundColor: meta.color }]} />
                </View>
                {(r.reason || r.impact) && (
                  <View style={styles.reasonBox}>
                    {r.reason && (
                      <>
                        <View style={styles.reasonLabelRow}>
                          <Feather name="flag" size={11} color={colors.danger} />
                          <Text style={styles.reasonLabel}>Lý do trễ:</Text>
                        </View>
                        <MarkdownText text={r.reason} style={styles.reasonText} />
                      </>
                    )}
                    {r.impact && (
                      <View style={[styles.reasonLabelRow, { marginTop: 6, alignItems: 'flex-start' }]}>
                        <Feather name="alert-triangle" size={11} color={colors.text} style={{ marginTop: 2 }} />
                        <MarkdownText text={`Ảnh hưởng: ${r.impact}`} style={styles.impactText} />
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })}

          <View style={styles.narrativeCard}>
            <View style={[styles.reasonLabelRow, { marginBottom: 6 }]}>
              <Feather name="cpu" size={13} color={colors.ai} />
              <Text style={[styles.narrativeLabel, { marginBottom: 0 }]}>AI NHẬN XÉT TỔNG THỂ</Text>
            </View>
            <MarkdownText text={data.overallNarrative} style={styles.narrativeText} />
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginBottom: 14 },
  errorText: { color: colors.danger, textAlign: 'center', marginTop: 20 },
  countRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  countCard: { flex: 1, borderRadius: 12, padding: 10, alignItems: 'center' },
  countValue: { fontSize: 18, fontWeight: '800' },
  countLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  phaseTitle: { fontWeight: '700', color: colors.text, fontSize: 13, flex: 1, marginRight: 8 },
  statusChip: { fontSize: 11, fontWeight: '800', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  dateText: { color: colors.textMuted, fontSize: 11, marginBottom: 6 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  reasonBox: { backgroundColor: colors.danger + '0D', borderRadius: 8, padding: 8, marginTop: 8 },
  reasonLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  reasonLabel: { fontSize: 11, fontWeight: '700', color: colors.danger },
  reasonText: { fontSize: 12, color: colors.text, marginTop: 2 },
  impactText: { fontSize: 12, color: colors.text, fontWeight: '700', flex: 1 },
  narrativeCard: {
    backgroundColor: `${colors.ai}14`,
    borderRadius: 14,
    padding: 14,
    marginTop: 6,
    borderWidth: 1,
    borderColor: `${colors.ai}33`,
  },
  narrativeLabel: { fontSize: 12, fontWeight: '700', color: colors.ai, marginBottom: 6 },
  narrativeText: { fontSize: 13, color: colors.text, lineHeight: 19 },
});

export default function AiScheduleReview() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  return (
    <AiGate projectId={projectId} title="AI đối chiếu tiến độ" description="Upload PDF tiến độ, AI đối chiếu với thực tế và cảnh báo sai lệch">
      <AiScheduleReviewInner />
    </AiGate>
  );
}
