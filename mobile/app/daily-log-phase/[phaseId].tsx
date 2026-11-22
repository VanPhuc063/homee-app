import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useGlobalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '@/api/client';
import { Feather } from '@/components/Feather';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { DailyLogData, DailyLogStep, Project } from '@/types';

// Trạng thái hiển thị của 1 bước nhỏ — suy ra từ Step.status + qualityDecision mới nhất trong
// reports (reports sắp createdAt asc, nên duyệt ngược để lấy quyết định gần nhất).
function stepStatus(step: DailyLogStep): { label: string; color: string; icon: 'check-circle' | 'clock' | 'x-circle' } {
  if (step.status === 'APPROVED') return { label: 'Hoàn thành', color: colors.success, icon: 'check-circle' };
  if (step.status === 'REJECTED') return { label: 'Cần làm lại', color: colors.danger, icon: 'x-circle' };
  const latestDecision = [...step.reports].reverse().find((r) => r.qualityDecision)?.qualityDecision;
  if (latestDecision === 'FAILED') return { label: 'Chưa đạt', color: colors.danger, icon: 'x-circle' };
  if (latestDecision === 'PASSED') return { label: 'Đạt kỹ thuật', color: colors.success, icon: 'check-circle' };
  return { label: 'Đang làm', color: colors.warning, icon: 'clock' };
}

export default function DailyLogPhaseScreen() {
  const { phaseId, projectId, date } = useGlobalSearchParams<{ phaseId: string; projectId: string; date: string }>();
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [draftPercent, setDraftPercent] = useState<Record<string, string>>({});

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/projects'),
  });
  const project = projects?.find((p) => p.id === projectId);
  const myRole = project?.members.find((m) => m.userId === user?.id)?.role;
  const isContractor = myRole === 'MAIN_CONTRACTOR' || myRole === 'SUB_CONTRACTOR';
  const isSupervisor = myRole === 'SUPERVISOR';

  const { data: log, isLoading } = useQuery({
    queryKey: ['daily-log', projectId, date],
    queryFn: () => api<DailyLogData>(`/projects/${projectId}/daily-log?date=${date}`),
    enabled: !!projectId && !!date,
  });

  const steps = (log?.steps ?? []).filter((s) => s.phaseId === phaseId);
  const phaseTitle = steps[0] ? `${steps[0].phaseCode}: ${steps[0].phaseName}` : 'Hạng mục';
  const done = steps.filter((s) => s.status === 'APPROVED').length;

  const postReport = useMutation({
    mutationFn: (p: { stepId: string; body?: string; progressPercent?: number }) =>
      api(`/steps/${p.stepId}/daily-log/reports`, {
        method: 'POST',
        body: { body: p.body, progressPercent: p.progressPercent },
      }),
    onSuccess: (_d, variables) => {
      setDrafts((prev) => ({ ...prev, [variables.stepId]: '' }));
      setDraftPercent((prev) => ({ ...prev, [variables.stepId]: '' }));
      qc.invalidateQueries({ queryKey: ['daily-log', projectId] });
    },
    onError: (e) => Alert.alert('Không gửi được', (e as Error).message),
  });

  const decideQuality = useMutation({
    mutationFn: (p: { stepId: string; body?: string; qualityDecision: 'PASSED' | 'FAILED' }) =>
      api(`/steps/${p.stepId}/daily-log/reports`, {
        method: 'POST',
        body: { body: p.body, qualityDecision: p.qualityDecision },
      }),
    onSuccess: (_d, variables) => {
      setDrafts((prev) => ({ ...prev, [variables.stepId]: '' }));
      qc.invalidateQueries({ queryKey: ['daily-log', projectId] });
    },
    onError: (e) => Alert.alert('Không gửi được', (e as Error).message),
  });

  const unpickStep = useMutation({
    mutationFn: (stepId: string) => api(`/steps/${stepId}/daily-log/unpick`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['daily-log', projectId] }),
    onError: (e) => Alert.alert('Lỗi', (e as Error).message),
  });

  const isToday = date === new Date().toISOString().slice(0, 10);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <TouchableOpacity style={styles.backRow} onPress={() => router.back()}>
        <Feather name="chevron-left" size={16} color={colors.primary} />
        <Text style={styles.backText}>Nhật ký ngày</Text>
      </TouchableOpacity>

      <Text style={styles.title}>{phaseTitle}</Text>
      <Text style={styles.subtitle}>
        {steps.length} bước nhỏ — {done}/{steps.length} hoàn thành
      </Text>

      {isLoading && <Text style={styles.empty}>Đang tải…</Text>}
      {!isLoading && steps.length === 0 && (
        <Text style={styles.empty}>Không có bước nào của hạng mục này được báo cáo trong ngày này.</Text>
      )}

      {steps.map((step) => {
        const st = stepStatus(step);
        return (
          <View key={step.stepId} style={[styles.stepCard, { borderLeftColor: st.color }]}>
            <View style={styles.stepHeader}>
              <Feather name={st.icon} size={16} color={st.color} />
              <Text style={styles.stepName}>{step.name}</Text>
              {isContractor && isToday && (
                <TouchableOpacity onPress={() => unpickStep.mutate(step.stepId)} disabled={unpickStep.isPending} hitSlop={8}>
                  <Feather name="x" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.metaRow}>
              <View style={[styles.pill, { backgroundColor: `${st.color}1A` }]}>
                <Text style={[styles.pillText, { color: st.color }]}>{st.label}</Text>
              </View>
              <Text style={styles.chipText}>📷 {step.photoCountToday}</Text>
              <Text style={styles.chipText}>🎥 {step.videoCountToday}</Text>
              <Text style={styles.chipText}>💬 {step.reports.length}</Text>
              {step.delayDays != null && step.delayDays > 0 && (
                <Text style={styles.delayText}>Trễ {step.delayDays}d</Text>
              )}
            </View>

            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${step.latestProgressPercent ?? 0}%`, backgroundColor: st.color },
                ]}
              />
            </View>
            <Text style={styles.progressCaption}>Thực tế {step.latestProgressPercent ?? 0}%</Text>

            {step.reports.length > 0 && (
              <View style={{ marginTop: 10, gap: 8 }}>
                {step.reports.map((r) => (
                  <View key={r.id} style={styles.reportRow}>
                    <Text style={styles.reportAuthor}>{r.author.name}</Text>
                    {!!r.body && <Text style={styles.reportBody}>{r.body}</Text>}
                    {r.progressPercent != null && (
                      <Text style={styles.reportTag}>Cập nhật tiến độ: {r.progressPercent}%</Text>
                    )}
                    {r.qualityDecision && (
                      <Text
                        style={[
                          styles.reportTag,
                          { color: r.qualityDecision === 'PASSED' ? colors.success : colors.danger },
                        ]}
                      >
                        {r.qualityDecision === 'PASSED' ? 'Đạt kỹ thuật' : 'Chưa đạt'}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            )}

            <View style={styles.inputRow}>
              <TextInput
                style={styles.reportInput}
                placeholder={
                  isContractor ? 'Báo cáo tiến độ hôm nay…' : isSupervisor ? 'Nhận xét kỹ thuật…' : 'Hỏi/góp ý…'
                }
                value={drafts[step.stepId] ?? ''}
                onChangeText={(t) => setDrafts((prev) => ({ ...prev, [step.stepId]: t }))}
                multiline
              />
              {isContractor && (
                <TextInput
                  style={styles.percentInput}
                  placeholder="%"
                  keyboardType="number-pad"
                  value={draftPercent[step.stepId] ?? ''}
                  onChangeText={(t) => setDraftPercent((prev) => ({ ...prev, [step.stepId]: t }))}
                />
              )}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TouchableOpacity
                style={[styles.sendBtn, { flex: 1 }]}
                disabled={postReport.isPending}
                onPress={() =>
                  postReport.mutate({
                    stepId: step.stepId,
                    body: drafts[step.stepId],
                    progressPercent: draftPercent[step.stepId] ? Number(draftPercent[step.stepId]) : undefined,
                  })
                }
              >
                <Text style={styles.sendBtnText}>Gửi</Text>
              </TouchableOpacity>
              {isSupervisor && (
                <>
                  <TouchableOpacity
                    style={[styles.qualityBtn, { backgroundColor: colors.success }]}
                    onPress={() =>
                      decideQuality.mutate({ stepId: step.stepId, body: drafts[step.stepId], qualityDecision: 'PASSED' })
                    }
                  >
                    <Text style={styles.sendBtnText}>Đạt</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.qualityBtn, { backgroundColor: colors.danger }]}
                    onPress={() =>
                      decideQuality.mutate({ stepId: step.stepId, body: drafts[step.stepId], qualityDecision: 'FAILED' })
                    }
                  >
                    <Text style={styles.sendBtnText}>Chưa đạt</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  backText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2, marginBottom: 16 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 12 },
  stepCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
  },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepName: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  pill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 11, fontWeight: '700' },
  chipText: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  delayText: { color: '#92400E', fontSize: 11, fontWeight: '700' },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden', marginTop: 10 },
  progressFill: { height: '100%', borderRadius: 3 },
  progressCaption: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  reportRow: { backgroundColor: colors.bg, borderRadius: 10, padding: 10 },
  reportAuthor: { fontWeight: '700', fontSize: 12, color: colors.primary },
  reportBody: { color: colors.text, fontSize: 13, marginTop: 2 },
  reportTag: { fontSize: 11, color: colors.textMuted, marginTop: 4, fontWeight: '600' },
  inputRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  reportInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
    color: colors.text,
    minHeight: 40,
    textAlignVertical: 'top',
  },
  percentInput: {
    width: 56,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
    color: colors.text,
    textAlign: 'center',
  },
  sendBtn: { backgroundColor: colors.primary, borderRadius: 10, padding: 10, alignItems: 'center' },
  qualityBtn: { flex: 1, borderRadius: 10, padding: 10, alignItems: 'center' },
  sendBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
