import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useGlobalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { api } from '@/api/client';
import { DayStrip, isoDay } from '@/components/DayStrip';
import { Feather } from '@/components/Feather';
import { mediaThumbUrl } from '@/media';
import { useAuth } from '@/store/auth';
import { colors, phaseStatusMeta, stepStatusMeta } from '@/theme';
import type { DailyLogData, Phase, Project, Step } from '@/types';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

function StepCard({ step, onPress }: { step: Step; onPress: () => void }) {
  const meta = stepStatusMeta[step.status] ?? stepStatusMeta.LOCKED;
  const photos = step.evidences.filter((e) => e.type === 'PHOTO').length;
  const previewEvidence = step.evidences.slice(0, 3);
  const extraCount = step.evidences.length - previewEvidence.length;
  const latestComment = step.comments?.[0];

  return (
    <TouchableOpacity
      style={[
        styles.stepCard,
        { borderLeftColor: meta.color },
        step.status === 'LOCKED' && { opacity: 0.55 },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.stepHeaderRow}>
        <Text
          style={[styles.stepName, step.status === 'APPROVED' && styles.stepNameDone]}
          numberOfLines={2}
        >
          {step.order}. {step.name}
          {step.mandatory && <Text style={{ color: colors.danger }}> *</Text>}
        </Text>
        <View style={[styles.statusChip, { backgroundColor: `${meta.color}1A` }]}>
          {step.status === 'APPROVED' && (
            <Feather name="check" size={11} color={meta.color} style={{ marginRight: 3 }} />
          )}
          <Text style={[styles.statusChipText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>

      {!!step.floorLabel && (
        <View style={styles.floorBadge}>
          <Feather name="repeat" size={10} color={colors.primary} />
          <Text style={styles.floorBadgeText}>{step.floorLabel}</Text>
        </View>
      )}

      <Text style={styles.stepMeta}>
        Ảnh {photos}/{step.minPhotos}
        {step.requiresVideo ? ' · Cần video' : ''}
        {step._count?.comments ? ` · ${step._count.comments} bình luận` : ''}
      </Text>

      {step.evidences.length > 0 ? (
        <View style={styles.photoGrid}>
          {previewEvidence.map((e) => (
            <View key={e.id} style={styles.photoThumbWrap}>
              <Image source={{ uri: mediaThumbUrl(e.objectKey) }} style={styles.photoThumb} contentFit="cover" />
              {e.type === 'VIDEO' && (
                <View style={styles.videoIconOverlay}>
                  <Feather name="video" size={12} color="#fff" />
                </View>
              )}
            </View>
          ))}
          {extraCount > 0 && (
            <View style={[styles.photoThumbWrap, styles.moreThumb]}>
              <Text style={styles.moreThumbText}>+{extraCount}</Text>
            </View>
          )}
        </View>
      ) : (
        step.status !== 'LOCKED' && (
          <View style={styles.emptyEvidenceRow}>
            <View style={styles.dashedTile}>
              <Feather name="camera" size={16} color={colors.textMuted} />
              <Text style={styles.dashedTileText}>Thêm ảnh</Text>
            </View>
            {step.requiresVideo && (
              <View style={styles.dashedTile}>
                <Feather name="video" size={16} color={colors.textMuted} />
                <Text style={styles.dashedTileText}>Thêm video</Text>
              </View>
            )}
          </View>
        )
      )}

      {latestComment && (
        <View style={styles.commentPreview}>
          <View style={styles.commentAvatar}>
            <Text style={styles.commentAvatarText}>{initials(latestComment.author.name)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.commentAuthor}>{latestComment.author.name}</Text>
            <Text style={styles.commentBody} numberOfLines={2}>
              {latestComment.body}
            </Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

/**
 * Tiến độ + Bằng chứng + Comment gộp 1 màn (mockup "08 — Báo cáo thi công + Comment") — mỗi bước
 * hiện luôn ảnh thumbnail thật + comment mới nhất ngay trong danh sách thay vì chỉ đếm số, đỡ phải
 * bấm vào từng bước mới biết có gì. Bấm vào thẻ vẫn mở step/[id] để duyệt/nộp/bình luận đầy đủ —
 * không gộp các action đó vào đây để tránh nhân bản logic duyệt 2 lớp + ảnh thiết bị đo.
 */
export default function ProjectTimeline() {
  // "index" tự resolve id qua local params (trùng thẳng segment "[id]"), nhưng "progress" là route
  // con của Tabs nên phải dùng global search params — xem giải thích ở members.tsx.
  const { id } = useGlobalSearchParams<{ id: string }>();
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [initialized, setInitialized] = useState(false);
  const [floorFilter, setFloorFilter] = useState('ALL');
  const [calDate, setCalDate] = useState(() => isoDay(new Date()));
  const todayIso = isoDay(new Date());

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/projects'),
  });
  const project = projects?.find((p) => p.id === id);
  const myRole = project?.members.find((m) => m.userId === user?.id)?.role;

  // API đã tự lọc: thầu phụ chỉ nhận về hạng mục được gán (xem `ProjectsService.getPhases`).
  const { data: phases, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['phases', id],
    queryFn: () => api<Phase[]>(`/projects/${id}/phases`),
    enabled: !!id,
  });

  // Preview gọn "hôm nay báo cáo gì" ngay trên tab Tiến độ — cùng cache key với daily-log.tsx nên
  // chuyển qua tab đó không fetch lại nếu đang xem đúng ngày vừa chọn ở đây.
  const { data: calLog } = useQuery({
    queryKey: ['daily-log', id, calDate],
    queryFn: () => api<DailyLogData>(`/projects/${id}/daily-log?date=${calDate}`),
    enabled: !!id,
  });

  const floors = useMemo(() => {
    const set = new Set<string>();
    (phases ?? []).forEach((p) => p.steps.forEach((s) => s.floorLabel && set.add(s.floorLabel)));
    return [...set];
  }, [phases]);

  // Mặc định: chỉ mở sẵn hạng mục đang thi công, thu gọn hạng mục đã xong/chưa mở —
  // giúp danh sách 16 hạng mục không bị quá dài khi cuộn.
  useEffect(() => {
    if (!phases || initialized) return;
    const initial: Record<string, boolean> = {};
    phases.forEach((p) => {
      initial[p.id] = p.status !== 'IN_PROGRESS';
    });
    setCollapsed(initial);
    setInitialized(true);
  }, [phases, initialized]);

  const togglePhase = (phaseId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsed((prev) => ({ ...prev, [phaseId]: !prev[phaseId] }));
  };

  const allCollapsed = useMemo(
    () => !!phases && phases.length > 0 && phases.every((p) => collapsed[p.id]),
    [phases, collapsed],
  );

  const toggleAll = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const next: Record<string, boolean> = {};
    (phases ?? []).forEach((p) => {
      next[p.id] = !allCollapsed;
    });
    setCollapsed(next);
  };

  // Các màn quản lý dự án (chuyển từ Dashboard/Thêm cũ sang đây để tab Thêm đúng 6 mục mockup 23).
  const tools = [
    { label: 'Upload PDF + AI đối chiếu', href: `/ai-schedule-review/${id}`, show: true },
    { label: 'Cảnh báo tiến độ', href: `/ai-alerts/${id}`, show: myRole !== 'SUB_CONTRACTOR' },
    { label: 'Hỏi AI tư vấn', href: `/ai-chat/${id}`, show: myRole === 'OWNER' },
    { label: 'Kế hoạch thi công', href: `/plan/${id}`, show: true },
    { label: 'Lịch thi công', href: `/calendar/${id}`, show: true },
    { label: 'Duyệt vật tư', href: `/material-check/${id}`, show: project?.contractType !== 'NHAN_CONG' },
    { label: 'Lỗi & khiếu nại', href: `/defects/${id}`, show: true },
    { label: 'Hoạt động dự án', href: `/project/${id}/diary`, show: true },
  ].filter((t) => t.show);

  const qc = useQueryClient();
  const deleteProject = useMutation({
    mutationFn: () => api(`/projects/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      router.replace('/');
    },
    onError: (e) => Alert.alert('Lỗi', (e as Error).message),
  });
  const confirmDelete = () =>
    Alert.alert('Xoá dự án?', `Toàn bộ dữ liệu của dự án "${project?.name}" sẽ bị xoá vĩnh viễn, không thể khôi phục.`, [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Xoá vĩnh viễn', style: 'destructive', onPress: () => deleteProject.mutate() },
    ]);

  const visiblePhases = (phases ?? []).map((phase) => ({
    ...phase,
    steps: phase.steps.filter((s) => floorFilter === 'ALL' || !s.floorLabel || s.floorLabel === floorFilter),
  }));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
    >
      <View style={styles.toolGrid}>
        {tools.map((t) => (
          <TouchableOpacity key={t.label} style={styles.toolChip} onPress={() => router.push(t.href as never)}>
            <Text style={styles.toolChipText}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ marginBottom: 12 }}>
        <DayStrip selectedDate={calDate} onSelect={setCalDate} />
      </View>

      <TouchableOpacity
        style={styles.calCard}
        activeOpacity={0.8}
        onPress={() => router.push({ pathname: `/project/${id}/daily-log`, params: { date: calDate } })}
      >
        <View style={styles.calCardHeader}>
          <Text style={styles.calCardTitle}>
            {calDate === todayIso ? 'Hôm nay báo cáo gì' : 'Việc đã báo cáo'}
          </Text>
          <Feather name="chevron-right" size={16} color={colors.primary} />
        </View>
        {!calLog || calLog.steps.length === 0 ? (
          <Text style={styles.calEmpty}>
            {calDate === todayIso
              ? 'Chưa chọn việc nào để báo cáo hôm nay — bấm để mở Nhật ký ngày.'
              : 'Không có việc nào được chọn báo cáo ngày này.'}
          </Text>
        ) : (
          calLog.steps.map((s) => (
            <View key={s.stepId} style={styles.calStepRow}>
              <Text style={styles.calStepName} numberOfLines={1}>
                {s.name}
              </Text>
              <Text style={styles.calStepPercent}>{s.latestProgressPercent ?? 0}%</Text>
            </View>
          ))
        )}
      </TouchableOpacity>

      {myRole === 'SUB_CONTRACTOR' && (
        <Text style={styles.scopeHint}>
          Chỉ hiện hạng mục bạn được gán thi công.
        </Text>
      )}

      {isLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />}

      {!isLoading && floors.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.floorTabsRow}>
          <TouchableOpacity
            style={[styles.floorChip, floorFilter === 'ALL' && styles.floorChipActive]}
            onPress={() => setFloorFilter('ALL')}
          >
            <Text style={[styles.floorChipText, floorFilter === 'ALL' && styles.floorChipTextActive]}>
              Tất cả
            </Text>
          </TouchableOpacity>
          {floors.map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.floorChip, floorFilter === f && styles.floorChipActive]}
              onPress={() => setFloorFilter(f)}
            >
              <Text style={[styles.floorChipText, floorFilter === f && styles.floorChipTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {!isLoading &&
        ((phases ?? []).length > 0 ? (
          <TouchableOpacity onPress={toggleAll} style={styles.toggleAllRow}>
            <Text style={styles.toggleAllText}>
              {allCollapsed ? 'Mở tất cả hạng mục' : 'Thu gọn tất cả hạng mục'}
            </Text>
            <Feather name={allCollapsed ? 'chevron-down' : 'chevron-up'} size={13} color={colors.primary} />
          </TouchableOpacity>
        ) : (
          myRole === 'SUB_CONTRACTOR' && (
            <Text style={styles.empty}>Bạn chưa được gán hạng mục nào trong dự án này.</Text>
          )
        ))}

      {visiblePhases.map((phase) => {
        if (floorFilter !== 'ALL' && phase.steps.length === 0) return null;
        const isCollapsed = collapsed[phase.id];
        const total = phase.steps.length;
        const done = phase.steps.filter((s) => s.status === 'APPROVED').length;
        const pMeta = phaseStatusMeta[phase.status] ?? phaseStatusMeta.LOCKED;
        return (
          <View key={phase.id} style={styles.phaseBlock}>
            <TouchableOpacity
              style={styles.phaseHeader}
              onPress={() => togglePhase(phase.id)}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
                <View style={[styles.statusDot, { backgroundColor: pMeta.color }]} />
                <Text
                  style={[styles.phaseTitle, phase.status === 'DONE' && styles.phaseTitleDone]}
                >
                  {phase.code}. {phase.name}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text
                  style={[
                    styles.phaseProgress,
                    phase.status === 'DONE' && { color: colors.success },
                  ]}
                >
                  {done}/{total}
                </Text>
                <Feather name={isCollapsed ? 'chevron-down' : 'chevron-up'} size={14} color={colors.textMuted} />
              </View>
            </TouchableOpacity>
            {!isCollapsed &&
              phase.steps.map((step) => (
                <StepCard key={step.id} step={step} onPress={() => router.push(`/step/${step.id}`)} />
              ))}
          </View>
        );
      })}
      <Text style={styles.legend}>* Bước bắt buộc theo quy trình chuẩn, không thể bỏ qua</Text>
      {myRole === 'OWNER' && (
        <TouchableOpacity style={styles.dangerBtn} disabled={deleteProject.isPending} onPress={confirmDelete}>
          <Feather name="trash-2" size={16} color={colors.danger} />
          <Text style={styles.dangerText}>{deleteProject.isPending ? 'Đang xoá…' : 'Xoá dự án'}</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  toolGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  toolChip: { borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' },
  toolChipText: { fontSize: 12, fontWeight: '600', color: colors.text },
  dangerBtn: { flexDirection: 'row', gap: 8, borderWidth: 1, borderColor: colors.danger, borderRadius: 10, padding: 14, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  dangerText: { color: colors.danger, fontWeight: '700' },
  container: { flex: 1, backgroundColor: colors.bg },
  calCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 16,
  },
  calCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  calCardTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  calEmpty: { color: colors.textMuted, fontSize: 12, marginTop: 8 },
  calStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 8,
  },
  calStepName: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.text },
  calStepPercent: { fontSize: 12, fontWeight: '700', color: colors.primary },
  toggleAllRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', marginBottom: 8 },
  toggleAllText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  scopeHint: { color: colors.textMuted, fontSize: 12, marginBottom: 8 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 20 },
  floorTabsRow: { marginBottom: 10 },
  floorChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    backgroundColor: colors.card,
  },
  floorChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  floorChipText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  floorChipTextActive: { color: '#fff' },
  phaseBlock: { marginBottom: 14 },
  phaseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    marginBottom: 4,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  phaseTitle: { fontSize: 15, fontWeight: '700', color: colors.text, flexShrink: 1 },
  phaseTitleDone: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  phaseProgress: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  stepCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
  },
  stepHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  stepName: { fontWeight: '600', color: colors.text, fontSize: 14, flex: 1 },
  stepNameDone: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  stepMeta: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  floorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryLight,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 6,
  },
  floorBadgeText: { fontSize: 10, fontWeight: '700', color: colors.primary },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusChipText: { fontSize: 11, fontWeight: '700' },
  photoGrid: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  photoThumbWrap: { position: 'relative' },
  photoThumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: colors.border },
  videoIconOverlay: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 6,
    padding: 2,
  },
  moreThumb: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  moreThumbText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  emptyEvidenceRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  dashedTile: {
    flex: 1,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 3,
  },
  dashedTileText: { fontSize: 11, color: colors.textMuted },
  commentPreview: { flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'flex-start' },
  commentAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.locked,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  commentAuthor: { fontSize: 11, fontWeight: '700', color: colors.text },
  commentBody: { fontSize: 12, color: colors.textMuted },
  legend: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 8 },
});
