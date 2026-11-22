import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { api } from '@/api/client';
import { AiLocked, useAiUnlocked } from '@/ai/AiLocked';
import { SummaryText } from '@/ai/SummaryText';
import { AiPremiumPopup, useAdsAllowed } from '@/ads/Ads';
import { Feather } from '@/components/Feather';
import { useAuth } from '@/store/auth';
import { colors, projectStatusMeta } from '@/theme';
import type { AiDailySummary, DashboardData, Phase, Project } from '@/types';

function fmtDate(iso: string | null) {
  if (!iso) return '--';
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

/**
 * Dashboard công trình (khớp mockup 9): tên + trạng thái, 4 chỉ số (Tiến độ / Đang làm / Đạt /
 * Không đạt), mục "Cần xử lý", "Đang thi công", và tổng kết AI. Các nút hành động phụ (Kế hoạch,
 * Lịch, Ứng tiền, Lỗi, Duyệt vật tư...) chuyển sang tab Thêm.
 */
export default function ProjectDashboard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);

  const { data: dashboard, isRefetching, refetch } = useQuery({
    queryKey: ['dashboard', id],
    queryFn: () => api<DashboardData>(`/projects/${id}/dashboard`),
    enabled: !!id,
  });

  const { data: phases } = useQuery({
    queryKey: ['phases', id],
    queryFn: () => api<Phase[]>(`/projects/${id}/phases`),
    enabled: !!id,
  });

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/projects'),
  });
  const project = projects?.find((p) => p.id === id);
  const myRole = project?.members.find((m) => m.userId === user?.id)?.role;

  const aiUnlocked = useAiUnlocked(id);
  const adsAllowed = useAdsAllowed(myRole);
  const { data: dailySummary } = useQuery({
    queryKey: ['ai-daily-summary', id],
    queryFn: () => api<AiDailySummary | null>(`/projects/${id}/ai/daily-summary`),
    enabled: !!id && !!aiUnlocked,
  });

  const deleteProject = useMutation({
    mutationFn: () => api(`/projects/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      router.replace('/');
    },
    onError: (e) => Alert.alert('Lỗi', (e as Error).message),
  });

  const confirmDeleteProject = () => {
    Alert.alert(
      'Xoá dự án?',
      `Toàn bộ dữ liệu của dự án "${project?.name}" (thành viên, hạng mục, ảnh, vật tư, nhật ký...) sẽ bị xoá vĩnh viễn, không thể khôi phục.`,
      [
        { text: 'Huỷ', style: 'cancel' },
        { text: 'Xoá vĩnh viễn', style: 'destructive', onPress: () => deleteProject.mutate() },
      ],
    );
  };

  if (!dashboard) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const allSteps = (phases ?? []).flatMap((p) => p.steps);
  const stepPhaseCode = (stepId: string) => (phases ?? []).find((p) => p.steps.some((x) => x.id === stepId))?.code ?? '';
  const doingCount = allSteps.filter((s) =>
    ['OPEN', 'SUBMITTED', 'SUPERVISOR_APPROVED'].includes(s.status),
  ).length;
  const doneCount = allSteps.filter((s) => s.status === 'APPROVED').length;
  const rejectedSteps = allSteps.filter((s) => s.status === 'REJECTED');
  const inProgressPhases = (phases ?? []).filter((p) => p.status === 'IN_PROGRESS');
  const isLate = (dashboard.forecastDelayDays ?? 0) > 0;
  const statusMeta = project ? (projectStatusMeta[project.status] ?? projectStatusMeta.DRAFT) : null;
  const pendingMaterials = dashboard.materials.pending;
  const needsAttention =
    rejectedSteps.length > 0 || pendingMaterials > 0 || !!dashboard.mostDelayedStep;

  // Dùng thử 2 tháng tính từ ngày tạo dự án (mockup 08–09).
  const trialFrom = project?.trialStartedAt ?? project?.createdAt;
  const trialDaysLeft = trialFrom
    ? Math.max(0, Math.ceil((new Date(trialFrom).getTime() + 61 * 864e5 - Date.now()) / 864e5))
    : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
    >
      <AiPremiumPopup enabled={adsAllowed && aiUnlocked === false} />
      <Text style={styles.projectLine} numberOfLines={1}>
        {dashboard.projectName}
        {project?.address ? ` — ${project.address}` : ''}
      </Text>

      <View style={styles.metricRow}>
        <Metric value={`${dashboard.actualPercent.toFixed(0)}%`} label="Tiến độ" color={colors.primary} />
        <Metric value={String(doingCount)} label="Đang làm" color="#2563EB" />
        <Metric value={String(doneCount)} label="Đạt" color={colors.primary} />
        <Metric value={String(rejectedSteps.length)} label="Không đạt" color={colors.danger} />
      </View>

      {project?.readOnly && (
        <TouchableOpacity
          style={[styles.trialBar, { borderColor: '#FECACA', backgroundColor: '#FEF2F2' }]}
          onPress={() => project.isBillingOwner && router.push('/subscription')}
        >
          <Text style={[styles.trialText, { color: colors.danger }]}>
            🔒 Dự án đang ở chế độ chỉ xem — {project.isBillingOwner ? 'gia hạn gói để tiếp tục cập nhật' : `chờ ${project.billingOwnerName ?? 'người tạo dự án'} gia hạn gói`}. Vẫn xem và xuất PDF bàn giao ở tab Thêm.
          </Text>
        </TouchableOpacity>
      )}
      {project?.isBillingOwner && trialDaysLeft != null && trialDaysLeft > 0 && (
        <TouchableOpacity style={styles.trialBar} onPress={() => router.push('/subscription')}>
          <Text style={styles.trialText}>⏳ Còn {trialDaysLeft} ngày dùng thử miễn phí</Text>
        </TouchableOpacity>
      )}

      {needsAttention && <Text style={styles.sectionTitle}>Cần xử lý</Text>}
      {rejectedSteps.map((s) => (
        <TouchableOpacity key={s.id} style={styles.alertCard} onPress={() => router.push(`/step/${s.id}`)}>
          <View style={styles.alertTitleRow}>
            <Feather name="alert-triangle" size={14} color={colors.danger} />
            <Text style={styles.alertTitle} numberOfLines={1}>
              {stepPhaseCode(s.id)}: {s.name}
              {s.floorLabel ? ` — ${s.floorLabel}` : ''}
            </Text>
          </View>
          <Text style={styles.alertBody}>Giám sát đánh giá &quot;Không đạt&quot;</Text>
        </TouchableOpacity>
      ))}
      {dashboard.mostDelayedStep && (
        <TouchableOpacity
          style={styles.alertCard}
          onPress={() => router.push(`/step/${dashboard.mostDelayedStep!.stepId}`)}
        >
          <View style={styles.alertTitleRow}>
            <Feather name="alert-triangle" size={14} color={colors.danger} />
            <Text style={styles.alertTitle} numberOfLines={1}>
              {dashboard.mostDelayedStep.name}
            </Text>
          </View>
          <Text style={styles.alertBody}>Trễ {dashboard.mostDelayedStep.delayDays} ngày so với kế hoạch</Text>
        </TouchableOpacity>
      )}
      {pendingMaterials > 0 && (
        <TouchableOpacity style={styles.alertCard} onPress={() => router.push(`/material-check/${id}`)}>
          <View style={styles.alertTitleRow}>
            <Feather name="alert-triangle" size={14} color={colors.danger} />
            <Text style={styles.alertTitle}>{pendingMaterials} loại vật tư chờ duyệt</Text>
          </View>
          <Text style={styles.alertBody}>Chủ nhà cần kiểm tra và duyệt</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.progressCard} onPress={() => router.push(`/project/${id}/progress`)} activeOpacity={0.8}>
        <Feather name="trending-up" size={18} color={colors.ai} />
        <View style={{ flex: 1 }}>
          <Text style={styles.progressTitle}>Quản lý tiến độ</Text>
          <Text style={styles.progressHint}>Chi tiết từng bước, upload PDF + AI đối chiếu</Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.textMuted} />
      </TouchableOpacity>

      {inProgressPhases.length > 0 && <Text style={styles.sectionTitle}>Đang thi công</Text>}
      {inProgressPhases.map((p) => {
        const total = p.steps.length;
        const done = p.steps.filter((s) => s.status === 'APPROVED').length;
        const pct = total ? Math.round((done / total) * 100) : 0;
        return (
          <TouchableOpacity key={p.id} style={styles.phaseCard} onPress={() => router.push(`/project/${id}/reports`)}>
            <Text style={styles.phaseTitle} numberOfLines={1}>
              {p.code}: {p.name}
            </Text>
            <Text style={[styles.phasePct, { color: pct >= 50 ? '#2563EB' : colors.warning }]}>{pct}%</Text>
          </TouchableOpacity>
        );
      })}

      {aiUnlocked === false && (
        <AiLocked title="AI tổng kết 8 PM" description="Mỗi tối AI tổng kết công việc, vấn đề phát sinh, nhân lực, vật tư và dự báo tiến độ" footer="Trả 1 lần, dùng vĩnh viễn" />
      )}
      {dailySummary && (
        <TouchableOpacity style={styles.aiCard} onPress={() => router.push(`/ai-alerts/${id}`)} activeOpacity={0.8}>
          <Text style={styles.aiTitle}>✨ Tổng kết hôm nay</Text>
          <View style={{ marginTop: 6 }}>
            <SummaryText body={dailySummary.body} numberOfLines={8} />
          </View>
        </TouchableOpacity>
      )}
      {myRole === 'OWNER' && (
        <TouchableOpacity style={styles.dangerBtn} disabled={deleteProject.isPending} onPress={confirmDeleteProject}>
          <Feather name="trash-2" size={16} color={colors.danger} />
          <Text style={styles.dangerText}>{deleteProject.isPending ? 'Đang xoá…' : 'Xoá dự án'}</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

function Metric({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  progressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginTop: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E9D5FF',
    backgroundColor: '#FAF5FF',
  },
  progressTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  progressHint: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  dangerBtn: {
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  dangerText: { color: colors.danger, fontWeight: '700' },
  container: { flex: 1, backgroundColor: '#fff' },
  loadingContainer: { alignItems: 'center', justifyContent: 'center' },
  projectLine: { fontSize: 13, color: colors.textMuted, marginBottom: 12 },
  metricRow: { flexDirection: 'row', gap: 8 },
  metric: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    paddingVertical: 12,
    alignItems: 'center',
  },
  metricValue: { fontSize: 20, fontWeight: '800' },
  metricLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  trialBar: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    padding: 12,
  },
  trialText: { fontSize: 13, fontWeight: '700', color: '#B45309' },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: colors.text, marginTop: 18, marginBottom: 8, textTransform: 'uppercase' },
  alertCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderLeftWidth: 4,
    borderLeftColor: colors.danger,
  },
  alertTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  alertTitle: { fontSize: 14, fontWeight: '700', color: colors.text, flex: 1 },
  alertBody: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  phaseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  phaseTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
  phasePct: { fontSize: 12, fontWeight: '700' },
  aiCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderLeftWidth: 4,
    borderLeftColor: colors.ai,
  },
  aiTitle: { fontSize: 14, fontWeight: '800', color: colors.ai },
});
