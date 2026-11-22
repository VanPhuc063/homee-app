import { useQuery } from '@tanstack/react-query';
import { AiGate } from '@/ai/AiLocked';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '@/api/client';
import { Feather } from '@/components/Feather';
import { MarkdownText } from '@/components/MarkdownText';
import { colors } from '@/theme';
import type { AiDailySummary, AiScheduleReview } from '@/types';

function AiAlertsInner() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const router = useRouter();

  const { data: review, isLoading } = useQuery({
    queryKey: ['ai-schedule-review', projectId],
    queryFn: () => api<AiScheduleReview>(`/projects/${projectId}/ai/schedule-review`),
    enabled: !!projectId,
  });

  const { data: dailySummary } = useQuery({
    queryKey: ['ai-daily-summary', projectId],
    queryFn: () => api<AiDailySummary | null>(`/projects/${projectId}/ai/daily-summary`),
    enabled: !!projectId,
  });

  const severe = (review?.rows ?? []).filter((r) => r.severity === 'SEVERE');
  const minor = (review?.rows ?? []).filter((r) => r.severity === 'MINOR');
  const onTrackCount =
    (review?.counts.onTime ?? 0) + (review?.counts.ahead ?? 0);

  const suggestedQuestions =
    severe[0]
      ? [
          `Đã xử lý xong lý do trễ ở ${severe[0].phaseCode} chưa?`,
          `Có phương án tăng ca bù tiến độ ${severe[0].phaseCode} không?`,
        ]
      : [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {isLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}

      {!isLoading && severe.length === 0 && minor.length === 0 && (
        <View style={styles.okCard}>
          <Feather name="check-circle" size={20} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.okTitle}>Đúng kế hoạch</Text>
            <Text style={styles.okSub}>Không có hạng mục nào đang trễ tiến độ.</Text>
          </View>
        </View>
      )}

      {severe.map((r) => (
        <View key={r.phaseCode} style={styles.severeCard}>
          <View style={styles.alertHeader}>
            <Feather name="alert-octagon" size={20} color={colors.danger} />
            <View style={{ flex: 1 }}>
              <Text style={styles.severeTitle}>Cảnh báo nghiêm trọng</Text>
              <Text style={styles.alertSub}>
                {r.phaseCode}: {r.phaseName} — Trễ {r.delayDays} ngày
              </Text>
            </View>
          </View>
          <View style={styles.separator} />
          {r.reason && (
            <Text style={styles.alertLine}>
              <Text style={styles.alertLineLabel}>Lý do: </Text>
              <MarkdownText text={r.reason} />
            </Text>
          )}
          {r.impact && (
            <Text style={styles.alertLine}>
              <Text style={styles.alertLineLabel}>Ảnh hưởng: </Text>
              <MarkdownText text={r.impact} />
            </Text>
          )}
          {r.quote && (
            <Text style={styles.alertLine}>
              <Text style={styles.alertLineLabel}>Trích báo cáo nhà thầu: </Text>"
              <MarkdownText text={r.quote} />"
            </Text>
          )}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <TouchableOpacity
              style={styles.outlineBtn}
              onPress={() => router.push(`/project/${projectId}/daily-log`)}
            >
              <Feather name="message-circle" size={13} color={colors.primary} />
              <Text style={styles.outlineBtnText}>Nhắn nhà thầu</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.push(`/ai-schedule-review/${projectId}`)}
            >
              <Feather name="clipboard" size={13} color="#fff" />
              <Text style={styles.primaryBtnText}>Xem chi tiết</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {minor.map((r) => (
        <View key={r.phaseCode} style={styles.minorCard}>
          <View style={styles.alertHeader}>
            <Feather name="alert-triangle" size={20} color={colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={styles.minorTitle}>Cảnh báo nhẹ</Text>
              <Text style={styles.alertSub}>
                {r.phaseCode}: {r.phaseName} — Trễ {r.delayDays} ngày
              </Text>
            </View>
          </View>
          {r.reason && (
            <Text style={styles.alertLine}>
              Lý do: <MarkdownText text={r.reason} />
            </Text>
          )}
        </View>
      ))}

      {(severe.length > 0 || minor.length > 0) && (
        <View style={styles.okCard}>
          <Feather name="check-circle" size={20} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.okTitle}>Đúng kế hoạch</Text>
            <Text style={styles.okSub}>
              {onTrackCount} hạng mục đang đúng hoặc sớm hơn tiến độ.
            </Text>
          </View>
        </View>
      )}

      {dailySummary && (
        <View style={styles.aiCard}>
          <View style={styles.cardTitleRow}>
            <Feather name="cpu" size={14} color={colors.ai} />
            <Text style={styles.aiCardTitle}>AI TỔNG KẾT TIẾN ĐỘ — 20:00</Text>
          </View>
          <MarkdownText text={dailySummary.body} style={styles.summaryText} />
          <Text style={styles.summaryFootnote}>
            Tự động tổng hợp bởi AI lúc{' '}
            {new Date(dailySummary.createdAt).toLocaleString('vi-VN', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
      )}

      <View style={styles.aiCard}>
        <View style={styles.cardTitleRow}>
          <Feather name="cpu" size={14} color={colors.ai} />
          <Text style={styles.aiCardTitle}>AI TƯ VẤN CHO CHỦ NHÀ</Text>
        </View>
        {suggestedQuestions.length > 0 && (
          <>
            <Text style={styles.summaryText}>Gợi ý câu hỏi để hỏi nhà thầu:</Text>
            {suggestedQuestions.map((q) => (
              <TouchableOpacity
                key={q}
                style={styles.questionChip}
                onPress={() =>
                  router.push({ pathname: `/ai-chat/${projectId}`, params: { initialQuestion: q } })
                }
              >
                <Text style={styles.questionText}>"{q}"</Text>
              </TouchableOpacity>
            ))}
          </>
        )}
        <TouchableOpacity
          style={[styles.outlineBtn, { marginTop: 8 }]}
          onPress={() => router.push(`/ai-chat/${projectId}`)}
        >
          <Feather name="message-circle" size={13} color={colors.primary} />
          <Text style={styles.outlineBtnText}>Chat tiếp với AI…</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  okCard: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  okTitle: { fontWeight: '700', color: colors.primary, fontSize: 14 },
  okSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  severeCard: {
    backgroundColor: '#FFF5F5',
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  minorCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1.5,
    borderColor: colors.warning,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  alertHeader: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  severeTitle: { fontWeight: '700', color: colors.danger, fontSize: 14 },
  minorTitle: { fontWeight: '700', color: colors.warning, fontSize: 14 },
  alertSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  separator: { height: 1, backgroundColor: colors.border, marginVertical: 10 },
  alertLine: { fontSize: 12, color: colors.text, marginBottom: 6, lineHeight: 17 },
  alertLineLabel: { fontWeight: '700' },
  outlineBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineBtnText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  aiCard: {
    backgroundColor: `${colors.ai}14`,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: `${colors.ai}33`,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  cardTitle: { fontSize: 12, fontWeight: '700', color: colors.text },
  aiCardTitle: { fontSize: 12, fontWeight: '700', color: colors.ai },
  summaryText: { fontSize: 12, color: colors.text, lineHeight: 18, marginBottom: 6 },
  summaryFootnote: { fontSize: 11, color: colors.textMuted, fontStyle: 'italic', marginTop: 4 },
  questionChip: { backgroundColor: '#fff', borderRadius: 8, padding: 8, marginBottom: 6, borderWidth: 1, borderColor: `${colors.ai}33` },
  questionText: { fontSize: 12, color: colors.text },
});

export default function AiAlerts() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  return (
    <AiGate projectId={projectId} title="Cảnh báo tiến độ" description="AI đối chiếu tiến độ, phát hiện trễ và nguyên nhân">
      <AiAlertsInner />
    </AiGate>
  );
}
