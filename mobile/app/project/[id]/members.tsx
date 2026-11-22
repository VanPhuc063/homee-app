import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useGlobalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { launchCamera } from '@/imagePicker';
import { api } from '@/api/client';
import { runOrQueue } from '@/offline/uploadQueue';
import { useDriveErrorAlert } from '@/googleDrive';
import { DayStrip, isoDay } from '@/components/DayStrip';
import { Feather } from '@/components/Feather';
import { mediaThumbUrl } from '@/media';
import { colors } from '@/theme';
import type { Workforce } from '@/types';

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/**
 * Tab Thành viên — báo cáo nhân công hàng ngày (mockup 20) + tick điểm danh, chụp ảnh, gửi chủ đầu
 * tư (mockup 21). Đội trưởng tick thợ đội mình (TeamAttendance), ai cũng xem được theo ngày. Mời /
 * phân quyền thành viên nằm ở "+ Thêm thành viên mới" (members/[projectId], form mockup 07).
 */
export default function MembersTab() {
  const { id: projectId } = useGlobalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const driveError = useDriveErrorAlert(projectId);
  const [date, setDate] = useState(isoDay(new Date()));
  const [ticks, setTicks] = useState<Record<string, { present: boolean; reason: string }>>({});
  const [photos, setPhotos] = useState<{ uri: string; contentType: string }[]>([]);

  const { data: wf, isLoading } = useQuery({
    queryKey: ['workforce', projectId, date],
    queryFn: () => api<Workforce>(`/projects/${projectId}/workforce?date=${date}`),
    enabled: !!projectId,
  });

  const isToday = date === isoDay(new Date());
  // Đội mình điểm danh được: đội trưởng = đội của mình; thầu chính = mọi đội.
  const myWorkers = (wf?.teams ?? []).filter((t) => t.isMine).flatMap((t) => t.workers);
  const canTick = isToday && myWorkers.length > 0;
  const canSend = isToday && (wf?.myRole === 'MAIN_CONTRACTOR' || wf?.myRole === 'SUB_CONTRACTOR');
  const canManage = wf?.myRole === 'OWNER' || wf?.myRole === 'MAIN_CONTRACTOR';

  useEffect(() => {
    if (!myWorkers.length) return;
    setTicks((prev) => {
      const next = { ...prev };
      for (const w of myWorkers) {
        if (!next[w.id]) next[w.id] = { present: w.present ?? true, reason: w.absenceReason ?? '' };
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wf]);

  const isPresent = (w: { id: string; present: boolean | null }) => (canTick ? ticks[w.id]?.present ?? true : w.present === true);
  const allWorkers = wf?.teams.flatMap((t) => t.workers) ?? [];
  const present = canTick ? allWorkers.filter(isPresent).length : (wf?.present ?? 0);
  const total = wf?.total ?? 0;
  const absent = canTick ? total - present : (wf?.absent ?? 0);
  const report = wf?.report;

  const invalidate = () => qc.invalidateQueries({ queryKey: ['workforce', projectId] });

  const send = useMutation({
    mutationFn: () =>
      runOrQueue({
        kind: 'workforce',
        projectId: projectId!,
        attendance: myWorkers.length
          ? {
              entries: myWorkers.map((w) => ({
                teamWorkerId: w.id,
                present: ticks[w.id]?.present ?? true,
                absenceReason: ticks[w.id]?.present === false ? ticks[w.id].reason.trim() || undefined : undefined,
              })),
            }
          : undefined,
        files: photos,
      }),
    onSuccess: (status) => {
      setPhotos([]);
      invalidate();
      if (status === 'queued') Alert.alert('Đã lưu tạm', 'Không có mạng — sẽ tự gửi khi có sóng trở lại.');
      else Alert.alert('Đã gửi', 'Báo cáo nhân công đã gửi cho chủ đầu tư.');
    },
    onError: (e) => driveError(e, 'Chưa gửi được'),
  });

  const takePhoto = async () => {
    const res = await launchCamera({ mediaType: 'photo', quality: 0.6 });
    const a = res.assets?.[0];
    if (res.didCancel || !a?.uri) return;
    setPhotos((prev) => [...prev, { uri: a.uri!, contentType: a.type ?? 'image/jpeg' }]);
  };

  const submit = () => {
    if (photos.length === 0) {
      Alert.alert('Cần ảnh tại công trình', 'Chụp ảnh toàn cảnh nhân công đang làm việc. Bắt buộc ít nhất 1 ảnh.');
      return;
    }
    send.mutate();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.stripWrap}>
        <DayStrip selectedDate={date} onSelect={setDate} />
      </View>

      <View style={{ padding: 16 }}>
        <View style={styles.metricRow}>
          <Metric value={present} label="Có mặt" color={colors.primary} />
          <Metric value={absent} label="Vắng" color={colors.danger} />
          <Metric value={total} label="Tổng" color={colors.primary} />
          <Metric value={report?.photos.length ?? 0} label="Ảnh" color="#2563EB" icon="📷 " />
        </View>

        {report && (
          <View style={styles.sentBar}>
            <Feather name="check-circle" size={16} color={colors.primary} />
            <Text style={styles.sentText}>Đã gửi cho chủ đầu tư</Text>
            <Text style={styles.sentTime}>{hhmm(report.sentAt)}</Text>
          </View>
        )}

        {isLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}
        {wf && wf.teams.length === 0 && (
          <Text style={styles.empty}>Chưa có đội thợ nào. Mời đội trưởng qua "+ Thêm thành viên mới".</Text>
        )}

        {canTick && <Text style={styles.section}>Tick chọn nhân công có mặt</Text>}
        {wf?.teams.map((t) => {
          const teamPresent = t.workers.filter(isPresent).length;
          return (
            <View key={t.memberId}>
              <Text style={styles.section}>
                Đội {t.teamTypeLabel.toLowerCase()} — {teamPresent}/{t.workers.length} có mặt
              </Text>
              <View style={styles.workerRow}>
                <View style={[styles.tick, styles.tickHidden]} />
                <Text style={styles.avatar}>{initials(t.leader.name)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.workerName}>{t.leader.name}</Text>
                  <Text style={styles.workerRole}>Đội trưởng — {t.teamTypeLabel}</Text>
                </View>
              </View>
              {t.workers.map((w) => {
                const on = isPresent(w);
                const editable = canTick && t.isMine;
                const reason = editable ? ticks[w.id]?.reason : w.absenceReason;
                return (
                  <View key={w.id} style={styles.workerRow}>
                    <TouchableOpacity
                      disabled={!editable}
                      onPress={() =>
                        setTicks((p) => ({ ...p, [w.id]: { present: !on, reason: p[w.id]?.reason ?? '' } }))
                      }
                      style={[styles.tick, on ? styles.tickOn : styles.tickOff, !editable && on && styles.tickHidden]}
                    >
                      {on ? (
                        editable && <Feather name="check" size={14} color="#fff" />
                      ) : (
                        !editable && <Feather name="x" size={14} color={colors.danger} />
                      )}
                    </TouchableOpacity>
                    <Text style={styles.avatar}>{initials(w.name)}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.workerName, !on && { color: colors.danger }]}>{w.name}</Text>
                      <Text style={[styles.workerRole, !on && { color: colors.danger }]}>
                        {!on
                          ? `Vắng${reason ? ` — ${reason}` : ''}`
                          : `Thợ — ${t.teamTypeLabel}`}
                      </Text>
                      {editable && !on && (
                        <TextInput
                          style={styles.reasonInput}
                          placeholder="Lý do vắng..."
                          value={ticks[w.id]?.reason ?? ''}
                          onChangeText={(v) => setTicks((p) => ({ ...p, [w.id]: { present: false, reason: v } }))}
                        />
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}

        <Text style={styles.section}>📷 {canSend ? 'Chụp ảnh tại công trình' : 'Ảnh nhân công tại công trình'}{canSend && <Text style={{ color: colors.danger }}> *</Text>}</Text>
        <View style={styles.photoRow}>
          {report?.photos.map((p) => (
            <View key={p.id} style={styles.photoCell}>
              <Image source={{ uri: mediaThumbUrl(p.objectKey) }} style={styles.photo} contentFit="cover" />
              <Text style={styles.photoTime}>{hhmm(p.createdAt)}</Text>
            </View>
          ))}
          {photos.map((p, i) => (
            <View key={`new-${i}`} style={styles.photoCell}>
              <Image source={{ uri: p.uri }} style={styles.photo} contentFit="cover" />
            </View>
          ))}
          {canSend && (
            <TouchableOpacity style={[styles.photo, styles.addPhoto]} onPress={takePhoto}>
              <Feather name="camera" size={22} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>
        {canSend && (
          <Text style={styles.hint}>Chụp ảnh toàn cảnh nhân công đang làm việc tại công trình. Bắt buộc ít nhất 1 ảnh.</Text>
        )}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{canSend ? 'Có mặt' : 'Tổng có mặt hôm nay'}</Text>
          <Text style={styles.totalValue}>
            {present} / {total} người{canSend && total ? ` (${Math.round((present / total) * 100)}%)` : ''}
          </Text>
        </View>

        {canSend && (
          <>
            <TouchableOpacity style={[styles.sendBtn, send.isPending && { opacity: 0.6 }]} disabled={send.isPending} onPress={submit}>
              {send.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.sendText}>{report ? 'Gửi lại báo cáo nhân công cho chủ đầu tư' : 'Gửi báo cáo nhân công cho chủ đầu tư'}</Text>
              )}
            </TouchableOpacity>
            <View style={styles.telegramNote}>
              <Feather name="send" size={13} color="#2563EB" />
              <Text style={styles.telegramText}>Tự động gửi Telegram + thông báo cho chủ nhà khi nhấn gửi</Text>
            </View>
          </>
        )}

        {canManage && (
          <TouchableOpacity onPress={() => router.push(`/members/${projectId}`)}>
            <Text style={styles.addMember}>+ Thêm thành viên mới</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

function Metric({ value, label, color, icon }: { value: number; label: string; color: string; icon?: string }) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, { color }]}>
        {icon}
        {value}
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  stripWrap: { paddingHorizontal: 8, paddingTop: 10 },
  metricRow: { flexDirection: 'row', gap: 8 },
  metric: { flex: 1, borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  metricValue: { fontSize: 20, fontWeight: '800' },
  metricLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  sentBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    backgroundColor: colors.primaryLight,
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  sentText: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.primary },
  sentTime: { fontSize: 12, color: colors.textMuted },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 20 },
  section: { fontSize: 12, fontWeight: '800', color: colors.text, marginTop: 18, marginBottom: 6, textTransform: 'uppercase' },
  workerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  tick: { width: 26, height: 26, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  tickOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tickOff: { borderColor: '#D1D5DB', backgroundColor: '#fff' },
  tickHidden: { opacity: 0 },
  avatar: { width: 28, fontSize: 11, fontWeight: '700', color: colors.textMuted, textAlign: 'center' },
  workerName: { fontSize: 14, fontWeight: '600', color: colors.text },
  workerRole: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  reasonInput: {
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    marginTop: 6,
    color: colors.text,
  },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoCell: { alignItems: 'center' },
  photo: { width: 96, height: 72, borderRadius: 10, backgroundColor: '#F3F4F6' },
  photoTime: { fontSize: 10, color: colors.textMuted, marginTop: 4 },
  addPhoto: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#22C55E',
    backgroundColor: '#fff',
  },
  hint: { fontSize: 11, color: colors.textMuted, marginTop: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18, paddingHorizontal: 4 },
  totalLabel: { fontSize: 13, color: colors.textMuted },
  totalValue: { fontSize: 13, color: colors.textMuted },
  sendBtn: { backgroundColor: colors.primary, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 14, minHeight: 50, justifyContent: 'center' },
  sendText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  telegramNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  telegramText: { fontSize: 12, color: '#2563EB', flex: 1 },
  addMember: { textAlign: 'center', color: colors.textMuted, fontWeight: '700', marginTop: 18, paddingVertical: 8 },
});
