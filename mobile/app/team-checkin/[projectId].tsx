import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { launchCamera } from '@/imagePicker';
import { compressIfVideo } from '@/offline/compress';
import { api, uploadTeamReport } from '@/api/client';
import { useDriveErrorAlert } from '@/googleDrive';
import { Feather } from '@/components/Feather';
import { LottieSuccess } from '@/components/LottieSuccess';
import { colors, teamTypeColor, teamTypeIcon } from '@/theme';
import type { MyTeam } from '@/types';

interface PickedMedia {
  uri: string;
  contentType: string;
  isVideo: boolean;
}

export default function TeamCheckin() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const qc = useQueryClient();
  const driveError = useDriveErrorAlert(projectId);

  const [newWorkerName, setNewWorkerName] = useState('');
  const [attendance, setAttendance] = useState<Record<string, { present: boolean; reason: string }>>({});
  const [workDone, setWorkDone] = useState('');
  const [planTomorrow, setPlanTomorrow] = useState('');
  const [issues, setIssues] = useState('');
  const [media, setMedia] = useState<PickedMedia[]>([]);
  const [justSent, setJustSent] = useState(false);

  const { data: team, isLoading } = useQuery({
    queryKey: ['my-team', projectId],
    queryFn: () => api<MyTeam>(`/projects/${projectId}/teams/me`),
    enabled: !!projectId,
  });

  useEffect(() => {
    if (!team) return;
    setAttendance((prev) => {
      const next = { ...prev };
      for (const w of team.workers) {
        if (!next[w.id]) next[w.id] = { present: w.present ?? true, reason: w.absenceReason ?? '' };
      }
      return next;
    });
  }, [team]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['my-team', projectId] });
    qc.invalidateQueries({ queryKey: ['teams', projectId] });
  };

  const addWorker = useMutation({
    mutationFn: () => api(`/projects/${projectId}/teams/workers`, { method: 'POST', body: { name: newWorkerName.trim() } }),
    onSuccess: () => {
      setNewWorkerName('');
      invalidate();
    },
    onError: (e) => Alert.alert('Lỗi', (e as Error).message),
  });

  const removeWorker = useMutation({
    mutationFn: (workerId: string) => api(`/team-workers/${workerId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
    onError: (e) => Alert.alert('Lỗi', (e as Error).message),
  });

  const submitAttendance = useMutation({
    mutationFn: () =>
      api(`/projects/${projectId}/teams/attendance`, {
        method: 'POST',
        body: {
          entries: Object.entries(attendance).map(([teamWorkerId, v]) => ({
            teamWorkerId,
            present: v.present,
            absenceReason: v.present ? undefined : v.reason || undefined,
          })),
        },
      }),
    onSuccess: () => {
      Alert.alert('Đã lưu điểm danh');
      invalidate();
    },
    onError: (e) => Alert.alert('Lỗi', (e as Error).message),
  });

  const submitReport = useMutation({
    mutationFn: () =>
      uploadTeamReport(
        projectId!,
        { workDone: workDone.trim(), planTomorrow: planTomorrow.trim() || undefined, issues: issues.trim() || undefined },
        media.map((m) => ({ uri: m.uri, contentType: m.contentType })),
      ),
    onSuccess: () => {
      invalidate();
      setMedia([]);
      setJustSent(true);
      setTimeout(() => setJustSent(false), 1400);
    },
    onError: (e) => driveError(e, 'Gửi báo cáo lỗi'),
  });

  const doSubmitReport = () => {
    if (!workDone.trim()) {
      Alert.alert('Thiếu thông tin', 'Ghi công việc đã làm hôm nay trước khi gửi.');
      return;
    }
    submitReport.mutate();
  };

  const addMedia = async (video: boolean) => {
    const result = await launchCamera({ mediaType: video ? 'video' : 'photo', quality: 0.6, durationLimit: 60 });
    if (result.didCancel) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    const contentType = asset.type ?? (video ? 'video/mp4' : 'image/jpeg');
    const uri = await compressIfVideo(asset.uri, contentType);
    setMedia((prev) => [...prev, { uri, contentType, isVideo: video }]);
  };

  const removeMedia = (index: number) => {
    setMedia((prev) => prev.filter((_, i) => i !== index));
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const tint = team ? teamTypeColor[team.teamType] : colors.primary;
  const presentCount = Object.values(attendance).filter((a) => a.present).length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={styles.headerRow}>
        <View style={[styles.teamBadge, { backgroundColor: tint + '1A' }]}>
          {team && <Feather name={teamTypeIcon[team.teamType] as any} size={12} color={tint} />}
          <Text style={[styles.teamBadgeText, { color: tint }]}>{team?.teamTypeLabel}</Text>
        </View>
      </View>
      <Text style={styles.title}>Điểm danh & Báo cáo</Text>

      {(team?.workers.length ?? 0) > 0 && (
        <View style={styles.summaryBar}>
          <Text style={styles.summaryText}>
            Hôm nay: {presentCount}/{team?.workers.length ?? 0} có mặt
          </Text>
          <Text style={styles.summaryPct}>
            {Math.round((presentCount / (team?.workers.length ?? 1)) * 100)}%
          </Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardLabel}>
          ĐIỂM DANH THỢ ({presentCount}/{team?.workers.length ?? 0})
        </Text>
        {(team?.workers ?? []).map((w) => {
          const a = attendance[w.id] ?? { present: true, reason: '' };
          return (
            <View key={w.id}>
              <View style={styles.workerRow}>
                <View style={styles.workerLeft}>
                  <View style={[styles.avatar, { backgroundColor: a.present ? colors.success : colors.danger }]}>
                    <Feather name={a.present ? 'check' : 'x'} size={13} color="#fff" />
                  </View>
                  <Text style={styles.workerName}>{w.name}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Switch
                    value={a.present}
                    onValueChange={(v) => setAttendance((prev) => ({ ...prev, [w.id]: { ...a, present: v } }))}
                    trackColor={{ false: colors.border, true: colors.success }}
                    thumbColor="#fff"
                  />
                  <TouchableOpacity onPress={() => removeWorker.mutate(w.id)} hitSlop={8}>
                    <Feather name="trash-2" size={16} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>
              {!a.present && (
                <TextInput
                  style={styles.reasonInput}
                  placeholder="Lý do vắng (tuỳ chọn)"
                  value={a.reason}
                  onChangeText={(text) => setAttendance((prev) => ({ ...prev, [w.id]: { ...a, reason: text } }))}
                />
              )}
            </View>
          );
        })}
      </View>

      <View style={styles.addWorkerRow}>
        <TextInput
          style={[styles.input, { flex: 1, marginBottom: 0 }]}
          placeholder="Tên thợ mới"
          value={newWorkerName}
          onChangeText={setNewWorkerName}
        />
        <TouchableOpacity
          style={[styles.addBtn, !newWorkerName.trim() && { opacity: 0.5 }]}
          disabled={!newWorkerName.trim() || addWorker.isPending}
          onPress={() => addWorker.mutate()}
        >
          <Feather name="plus" size={14} color="#fff" />
          <Text style={styles.addBtnText}>Thêm</Text>
        </TouchableOpacity>
      </View>

      {(team?.workers ?? []).length > 0 && (
        <TouchableOpacity
          style={[styles.submitBtnOutline, { marginTop: 4 }, submitAttendance.isPending && { opacity: 0.5 }]}
          disabled={submitAttendance.isPending}
          onPress={() => submitAttendance.mutate()}
        >
          <Text style={styles.submitOutlineText}>
            {submitAttendance.isPending ? 'Đang lưu…' : 'Lưu điểm danh hôm nay'}
          </Text>
        </TouchableOpacity>
      )}

      {justSent ? (
        <View style={styles.successWrap}>
          <LottieSuccess size={80} />
          <Text style={styles.successText}>Đã gửi báo cáo cho nhà thầu!</Text>
        </View>
      ) : (
        <>
          <View style={[styles.card, { marginTop: 20 }]}>
            <Text style={styles.cardLabel}>BÁO CÁO CÔNG VIỆC</Text>
            {team?.report && (
              <View style={styles.reportSentCard}>
                <Feather name="check-circle" size={13} color={colors.primary} />
                <Text style={styles.reportSentText}>
                  Đã gửi lúc {new Date(team.report.createdAt).toLocaleTimeString('vi-VN')} — gửi lại sẽ ghi đè.
                </Text>
              </View>
            )}
            <Text style={styles.inputLabel}>Công việc đã làm hôm nay</Text>
            <TextInput
              style={[styles.input, { minHeight: 70 }]}
              placeholder="VD: Đổ bê tông dầm sàn tầng 2, hoàn thành 80%…"
              value={workDone}
              onChangeText={setWorkDone}
              multiline
            />
            <Text style={styles.inputLabel}>Kế hoạch ngày mai (tuỳ chọn)</Text>
            <TextInput
              style={[styles.input, { minHeight: 50 }]}
              placeholder="Kế hoạch ngày mai…"
              value={planTomorrow}
              onChangeText={setPlanTomorrow}
              multiline
            />
            <Text style={styles.inputLabel}>Vấn đề phát sinh (tuỳ chọn)</Text>
            <TextInput
              style={[styles.input, { minHeight: 50, marginBottom: 0 }]}
              placeholder="Vấn đề phát sinh…"
              value={issues}
              onChangeText={setIssues}
              multiline
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>ĐÍNH KÈM</Text>
            <View style={styles.mediaGrid}>
              {media.map((m, i) => (
                <View key={i} style={styles.mediaThumbWrap}>
                  {m.isVideo ? (
                    <View style={[styles.mediaThumb, styles.videoThumb]}>
                      <Feather name="video" size={22} color={colors.textMuted} />
                    </View>
                  ) : (
                    <Image source={{ uri: m.uri }} style={styles.mediaThumb} contentFit="cover" />
                  )}
                  <TouchableOpacity style={styles.removeMediaBtn} onPress={() => removeMedia(i)}>
                    <Feather name="x" size={12} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: media.length > 0 ? 8 : 0 }}>
              <TouchableOpacity style={styles.attachTile} onPress={() => addMedia(false)}>
                <Feather name="camera" size={20} color={colors.textMuted} />
                <Text style={styles.attachTileText}>Thêm ảnh</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.attachTile} onPress={() => addMedia(true)}>
                <Feather name="video" size={20} color={colors.textMuted} />
                <Text style={styles.attachTileText}>Thêm video</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, submitReport.isPending && { opacity: 0.5 }]}
            disabled={submitReport.isPending}
            onPress={doSubmitReport}
          >
            {submitReport.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Feather name="send" size={16} color="#fff" />
                <Text style={styles.submitText}>Gửi báo cáo cho nhà thầu</Text>
              </>
            )}
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  teamBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  teamBadgeText: { fontSize: 12, fontWeight: '700' },
  title: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 8, marginBottom: 12 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardLabel: { fontSize: 11, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.5, marginBottom: 10 },
  summaryBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.success + '1A',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  summaryText: { fontSize: 14, fontWeight: '700', color: colors.text },
  summaryPct: { fontSize: 12, fontWeight: '800', color: colors.success, backgroundColor: colors.card, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  workerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.bg,
  },
  workerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  workerName: { fontWeight: '700', color: colors.text, fontSize: 14, flexShrink: 1 },
  reasonInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, marginTop: 6, marginBottom: 4, marginLeft: 38, fontSize: 13 },
  addWorkerRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    fontSize: 14, color: colors.text,
  },
  inputLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted, marginBottom: 6 },
  submitBtn: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  submitText: { color: '#fff', fontWeight: '700' },
  submitBtnOutline: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  submitOutlineText: { color: colors.primary, fontWeight: '700' },
  reportSentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primaryLight,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  reportSentText: { color: colors.primary, fontSize: 12, flexShrink: 1 },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mediaThumbWrap: { position: 'relative' },
  mediaThumb: { width: 72, height: 72, borderRadius: 10, backgroundColor: colors.border },
  videoThumb: { alignItems: 'center', justifyContent: 'center' },
  removeMediaBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachTile: {
    flex: 1,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 4,
  },
  attachTileText: { fontSize: 12, color: colors.textMuted },
  successWrap: { alignItems: 'center', paddingVertical: 40 },
  successText: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 12 },
});
