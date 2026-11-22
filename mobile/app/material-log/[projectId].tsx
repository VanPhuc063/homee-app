import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useGlobalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { launchCamera, launchImageLibrary } from '@/imagePicker';
import { api } from '@/api/client';
import { DayStrip, isoDay } from '@/components/DayStrip';
import { Feather } from '@/components/Feather';
import { showDriveUploadError } from '@/googleDrive';
import { runOrQueue } from '@/offline/uploadQueue';
import { mediaThumbUrl } from '@/media';
import { useAuth } from '@/store/auth';
import { colors, roleLabel } from '@/theme';
import type { MaterialLogData, MaterialLogItem, MaterialStepOption, Phase, Project } from '@/types';

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const NOTE_MAX = 500;

function fmtVnd(n: number) {
  return n.toLocaleString('vi-VN') + 'đ';
}

interface PickedPhoto {
  uri: string;
  contentType: string;
}

export default function MaterialLogScreen() {
  // Dùng được cả khi mở như route riêng ([projectId]) lẫn như tab trong dự án ([id] → materials.tsx).
  const { projectId: routeProjectId, id } = useGlobalSearchParams<{ projectId?: string; id?: string }>();
  const projectId = routeProjectId ?? id;
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();

  const [selectedDate, setSelectedDate] = useState(() => isoDay(new Date()));
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('Bao');
  const [unitPrice, setUnitPrice] = useState('');
  const [note, setNote] = useState('');
  const [selectedStepIds, setSelectedStepIds] = useState<string[]>([]);
  const [showAllSteps, setShowAllSteps] = useState(false);
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [noteDraft, setNoteDraft] = useState('');
  const [viewerPhoto, setViewerPhoto] = useState<string | null>(null);


  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/projects'),
  });
  const project = projects?.find((p) => p.id === projectId);
  const myRole = project?.members.find((m) => m.userId === user?.id)?.role;

  const { data: phases } = useQuery({
    queryKey: ['phases', projectId],
    queryFn: () => api<Phase[]>(`/projects/${projectId}/phases`),
    enabled: !!projectId,
  });

  const stepOptions: MaterialStepOption[] = useMemo(
    () =>
      (phases ?? []).flatMap((p) =>
        p.steps.map((s) => ({ stepId: s.id, stepCode: p.code, stepName: s.name, phaseName: p.name })),
      ),
    [phases],
  );

  const { data: log, isLoading } = useQuery({
    queryKey: ['material-log', projectId, selectedDate],
    queryFn: () => api<MaterialLogData>(`/projects/${projectId}/material-logs?date=${selectedDate}`),
    enabled: !!projectId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['material-log', projectId] });

  const resetForm = () => {
    setName('');
    setQuantity('');
    setUnitPrice('');
    setNote('');
    setSelectedStepIds([]);
    setPhotos([]);
    setShowAllSteps(false);
    setEditingId(null);
  };

  const addMaterial = useMutation({
    mutationFn: () =>
      runOrQueue({
        kind: 'material',
        projectId: projectId!,
        dto: {
          name: name.trim(),
          quantity: Number(quantity),
          unit,
          unitPrice: log?.canSeePrice && unitPrice ? Number(unitPrice) : undefined,
          note: note.trim() || undefined,
          date: selectedDate,
          stepIds: selectedStepIds,
        },
        files: photos,
      }),
    onSuccess: (status) => {
      if (status === 'queued') Alert.alert('Đã lưu tạm', 'Không có mạng — sẽ tự gửi khi có sóng trở lại.');
      resetForm();
      setShowForm(false);
      invalidate();
    },
    onError: (e) => showDriveUploadError((e as Error).message, !!project?.canManageDrive),
  });

  const updateMaterial = useMutation({
    mutationFn: () =>
      api(`/material-logs/${editingId}`, {
        method: 'PATCH',
        body: {
          name: name.trim(),
          quantity: Number(quantity),
          unit,
          unitPrice: log?.canSeePrice && unitPrice ? Number(unitPrice) : undefined,
          note: note.trim() || undefined,
        },
      }),
    onSuccess: () => {
      resetForm();
      setShowForm(false);
      invalidate();
    },
    onError: (e) => Alert.alert('Lỗi', (e as Error).message),
  });

  const deleteMaterial = useMutation({
    mutationFn: (id: string) => api(`/material-logs/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
    onError: (e) => Alert.alert('Lỗi', (e as Error).message),
  });

  const addNote = useMutation({
    mutationFn: () =>
      api(`/projects/${projectId}/material-logs/notes`, {
        method: 'POST',
        body: { body: noteDraft.trim(), date: selectedDate },
      }),
    onSuccess: () => {
      setNoteDraft('');
      invalidate();
    },
    onError: (e) => Alert.alert('Lỗi', (e as Error).message),
  });

  const toggleStep = (stepId: string) =>
    setSelectedStepIds((prev) =>
      prev.includes(stepId) ? prev.filter((id) => id !== stepId) : [...prev, stepId],
    );

  const addPhoto = async (useCamera: boolean) => {
    const picker = useCamera ? launchCamera : launchImageLibrary;
    const result = await picker({ mediaType: 'photo', quality: 0.6 });
    if (result.didCancel) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    if (asset.fileSize && asset.fileSize > MAX_PHOTO_BYTES) {
      Alert.alert('Ảnh quá lớn', 'Ảnh hóa đơn tối đa 10MB, chọn ảnh khác hoặc chụp lại.');
      return;
    }
    setPhotos((prev) => [...prev, { uri: asset.uri!, contentType: asset.type ?? 'image/jpeg' }]);
  };

  const removePhoto = (i: number) => setPhotos((prev) => prev.filter((_, idx) => idx !== i));

  const startEdit = (m: MaterialLogItem) => {
    setEditingId(m.id);
    setName(m.name);
    setQuantity(String(m.quantity));
    setUnit(m.unit);
    setUnitPrice(m.unitPrice != null ? String(m.unitPrice) : '');
    setNote(m.note ?? '');
    setSelectedStepIds(m.steps.map((s) => s.stepId));
    setPhotos([]);
    setShowForm(true);
  };

  const cancelForm = () => {
    resetForm();
    setShowForm(false);
  };

  const doSave = () => {
    if (!name.trim()) return Alert.alert('Thiếu thông tin', 'Nhập tên vật tư.');
    if (!quantity || Number(quantity) <= 0) return Alert.alert('Thiếu thông tin', 'Nhập số lượng hợp lệ.');
    if (editingId) {
      updateMaterial.mutate();
      return;
    }
    if (selectedStepIds.length === 0) return Alert.alert('Thiếu thông tin', 'Chọn ít nhất 1 bước thi công.');
    if (photos.length === 0) return Alert.alert('Thiếu thông tin', 'Chụp/chọn ít nhất 1 ảnh hóa đơn.');
    addMaterial.mutate();
  };

  const confirmDelete = (id: string) => {
    Alert.alert('Xoá vật tư này?', 'Không thể khôi phục sau khi xoá.', [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Xoá', style: 'destructive', onPress: () => deleteMaterial.mutate(id) },
    ]);
  };

  const saving = addMaterial.isPending || updateMaterial.isPending;
  const isLeader = myRole === 'SUB_CONTRACTOR';
  const subtitle = `${roleLabel[myRole ?? ''] ?? ''} — ${log?.canSeePrice ? 'Có giá' : isLeader ? 'Không nhập giá' : 'Không có giá'}`;
  const items = log?.items ?? [];
  const d = new Date(selectedDate + 'T00:00:00.000Z');
  const dateLabel = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
  const invoicePct = items.length ? Math.round((items.filter((m) => m.photos.length > 0).length / items.length) * 100) : 0;

  // Form "Thêm vật tư" (mockup 18) — màn riêng, thay cho danh sách.
  if (showForm) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.formTitle}>{editingId ? 'Sửa vật tư' : 'Thêm vật tư'}</Text>
        <Label text="Ngày báo cáo" required />
        <View style={[styles.input, styles.row]}>
          <Feather name="calendar" size={15} color="#2563EB" />
          <Text style={styles.inputText}>{dateLabel}</Text>
        </View>
        <Label text="Tên vật tư" required />
        <TextInput style={styles.input} placeholder="Xi măng Nghị Sơn..." value={name} onChangeText={setName} />
        <Label text="Số lượng" required />
        <TextInput style={styles.input} placeholder="30" keyboardType="decimal-pad" value={quantity} onChangeText={setQuantity} />
        <Label text="Đơn vị" required />
        <View style={styles.unitRow}>
          {['Bao', 'Cây', 'Tấn', 'm³', 'Mét', 'Khác'].map((u) => (
            <TouchableOpacity key={u} style={[styles.unitChip, unit === u && styles.unitChipOn]} onPress={() => setUnit(u)}>
              <Text style={[styles.unitText, unit === u && styles.unitTextOn]}>{u}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {log?.canSeePrice && (
          <>
            <Text style={styles.label}>
              Đơn giá (VNĐ) <Text style={styles.labelHint}>{myRole === 'OWNER' ? 'Chỉ bạn và thầu thấy' : 'Chỉ thầu thấy'}</Text>
            </Text>
            <TextInput style={styles.input} placeholder="70.000" keyboardType="number-pad" value={unitPrice} onChangeText={setUnitPrice} />
          </>
        )}
        {!editingId && (
          <>
            <Label text="Bước thi công" required />
            <View style={styles.unitRow}>
              {stepOptions
                .filter((o) => selectedStepIds.includes(o.stepId))
                .map((o) => (
                  <TouchableOpacity key={o.stepId} style={[styles.stepChip, styles.stepChipOn]} onPress={() => toggleStep(o.stepId)}>
                    <Text style={styles.stepChipText}>
                      {o.stepCode} {o.stepName}
                    </Text>
                  </TouchableOpacity>
                ))}
              <TouchableOpacity onPress={() => setShowAllSteps((v) => !v)}>
                <Text style={styles.addStep}>{showAllSteps ? 'Xong' : '+ Thêm'}</Text>
              </TouchableOpacity>
            </View>
            {showAllSteps && (
              <View style={styles.stepPicker}>
                <ScrollView nestedScrollEnabled>
                  {stepOptions.map((o) => {
                    const on = selectedStepIds.includes(o.stepId);
                    return (
                      <TouchableOpacity key={o.stepId} style={styles.pickRow} onPress={() => toggleStep(o.stepId)}>
                        <Feather name={on ? 'check-square' : 'square'} size={15} color={on ? colors.primary : colors.textMuted} />
                        <Text style={styles.pickText}>
                          {o.stepCode} {o.stepName}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}
            <Text style={styles.label}>
              Hoá đơn / Chứng từ <Text style={{ color: colors.danger }}>*</Text>{' '}
              <Text style={[styles.labelHint, { color: colors.danger }]}>Bắt buộc</Text>
            </Text>
            <View style={styles.photoRow}>
              {photos.map((p, i) => (
                <TouchableOpacity key={i} onPress={() => removePhoto(i)}>
                  <Image source={{ uri: p.uri }} style={styles.photoBox} contentFit="cover" />
                </TouchableOpacity>
              ))}
              {photos.length < 5 && (
                <>
                  <TouchableOpacity style={[styles.photoBox, styles.cameraBox]} onPress={() => addPhoto(true)}>
                    <Feather name="camera" size={24} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.photoBox, styles.galleryBox]} onPress={() => addPhoto(false)}>
                    <Feather name="image" size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                </>
              )}
            </View>
            <Text style={styles.photoHint}>Tối đa 5 ảnh. JPG/PNG/HEIC, max 10MB</Text>
          </>
        )}
        <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} disabled={saving} onPress={doSave}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>✓ Lưu vật tư</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={cancelForm}>
          <Text style={styles.cancelText}>Huỷ</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <View style={{ paddingHorizontal: 8 }}>
        <DayStrip selectedDate={selectedDate} onSelect={setSelectedDate} />
      </View>

      <View style={{ padding: 16 }}>
        {isLoading && <ActivityIndicator color={colors.primary} />}

        {log?.canSeePrice && (
          <Text style={styles.dateLine}>
            {dateLabel} — {items.length} vật tư
          </Text>
        )}

        {log && !log.canSeePrice && !isLeader && (
          <View style={styles.metricRow}>
            <Metric value={String(log.metrics.materialCount)} label="Loại vật tư" color={colors.primary} />
            <Metric value={`${invoicePct}%`} label="Có hoá đơn" color={colors.primary} />
            <Metric value={String(log.metrics.stepCount)} label="Bước liên quan" color="#2563EB" />
          </View>
        )}

        {log && items.length === 0 && <Text style={styles.empty}>Chưa có vật tư nào trong ngày này.</Text>}

        {items.map((m) => {
          const hasInvoice = m.photos.length > 0;
          return (
            <TouchableOpacity
              key={m.id}
              style={styles.card}
              activeOpacity={m.canEdit ? 0.7 : 1}
              onLongPress={() => m.canEdit && confirmDelete(m.id)}
              onPress={() => m.canEdit && startEdit(m)}
            >
              <View style={styles.cardHead}>
                <Text style={styles.cardName}>{m.name}</Text>
                {log?.canSeePrice && m.total != null && <Text style={styles.cardTotal}>{fmtVnd(m.total)}</Text>}
              </View>
              <Text style={styles.cardQty}>
                {m.quantity} {m.unit}
                {log?.canSeePrice && m.unitPrice != null ? ` × ${fmtVnd(m.unitPrice)}` : ''}
              </Text>
              <View style={styles.tagRow}>
                {m.steps.map((s) => (
                  <Text key={s.stepId} style={styles.tag}>
                    {log?.canSeePrice ? `${s.stepCode} ${s.stepName}` : s.stepCode}
                  </Text>
                ))}
              </View>
              {!isLeader &&
                (log?.canSeePrice ? (
                  <View style={styles.invoiceRow}>
                    <View style={[styles.dot, { backgroundColor: hasInvoice ? '#22C55E' : colors.danger }]} />
                    {hasInvoice ? (
                      <TouchableOpacity onPress={() => setViewerPhoto(m.photos[0].objectKey)}>
                        <Text style={styles.invoiceText}>Hoá đơn 📷</Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={[styles.invoiceText, { color: colors.danger }]}>Chưa có hoá đơn</Text>
                    )}
                  </View>
                ) : hasInvoice ? (
                  <TouchableOpacity onPress={() => setViewerPhoto(m.photos[0].objectKey)}>
                    <Text style={styles.viewInvoice}>📷 Xem hoá đơn</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.noInvoice}>⚠️ Chưa có hoá đơn</Text>
                ))}
            </TouchableOpacity>
          );
        })}

        {isLeader && (
          <View style={styles.leaderNote}>
            <Text style={styles.leaderNoteTitle}>Đội trưởng chỉ nhập: tên, số lượng, đơn vị</Text>
            <Text style={styles.leaderNoteSub}>Đơn giá do nhà thầu nhập</Text>
          </View>
        )}

        {log?.canSeePrice && log.dailyTotal != null && (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Tổng chi hôm nay</Text>
            <Text style={styles.totalValue}>{fmtVnd(log.dailyTotal)}</Text>
          </View>
        )}

        {log?.canSeeNotes && log.notes.length > 0 && (
          <View style={{ marginTop: 10 }}>
            {log.notes.map((n) => (
              <View key={n.id} style={styles.noteItem}>
                <Text style={styles.noteAuthor}>{n.author.name}</Text>
                <Text style={styles.noteBody}>{n.body}</Text>
              </View>
            ))}
          </View>
        )}

        {log?.canSendNote && (
          <>
            <Text style={styles.noteLabel}>💬 Ghi chú cho thầu</Text>
            <TextInput
              style={styles.input}
              placeholder="Nhớ gửi hoá đơn thép sớm nhé..."
              value={noteDraft}
              onChangeText={setNoteDraft}
              maxLength={NOTE_MAX}
            />
            <TouchableOpacity disabled={!noteDraft.trim() || addNote.isPending} onPress={() => addNote.mutate()}>
              <Text style={[styles.addText, !!noteDraft.trim() && { color: colors.primary }]}>Gửi ghi chú</Text>
            </TouchableOpacity>
          </>
        )}

        {log?.canAdd && (
          <TouchableOpacity
            onPress={() => {
              resetForm();
              setShowForm(true);
            }}
          >
            <Text style={styles.addText}>{isLeader ? '+ Thêm vật tư (đội mình)' : '+ Thêm vật tư'}</Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={!!viewerPhoto} transparent animationType="fade" onRequestClose={() => setViewerPhoto(null)}>
        <TouchableOpacity style={styles.viewer} activeOpacity={1} onPress={() => setViewerPhoto(null)}>
          {viewerPhoto && <Image source={{ uri: mediaThumbUrl(viewerPhoto) }} style={styles.viewerImg} contentFit="contain" />}
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

function Label({ text, required }: { text: string; required?: boolean }) {
  return (
    <Text style={styles.label}>
      {text}
      {required && <Text style={{ color: colors.danger }}> *</Text>}
    </Text>
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
  container: { flex: 1, backgroundColor: '#fff' },
  subtitle: { fontSize: 12, color: colors.textMuted, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  dateLine: { fontSize: 12, fontWeight: '800', color: colors.text, marginBottom: 10, textTransform: 'uppercase' },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 16 },
  metricRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  metric: { flex: 1, borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  metricValue: { fontSize: 20, fontWeight: '800' },
  metricLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  card: { borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 10, padding: 14, marginBottom: 10 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  cardName: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  cardTotal: { fontSize: 15, fontWeight: '800', color: '#2563EB' },
  cardQty: { fontSize: 13, color: colors.text, marginTop: 4 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  tag: { fontSize: 11, color: colors.primary, backgroundColor: colors.primaryLight, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  invoiceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  invoiceText: { fontSize: 13, color: colors.text },
  viewInvoice: { fontSize: 12, color: '#2563EB', marginTop: 8 },
  noInvoice: { fontSize: 12, color: colors.danger, marginTop: 8 },
  leaderNote: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#F59E0B', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 4 },
  leaderNoteTitle: { fontSize: 13, fontWeight: '700', color: '#D97706' },
  leaderNoteSub: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginTop: 8 },
  totalLabel: { fontSize: 13, color: colors.textMuted },
  totalValue: { fontSize: 13, color: colors.textMuted },
  noteItem: { borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 10, padding: 10, marginBottom: 6 },
  noteAuthor: { fontSize: 11, fontWeight: '700', color: colors.primary },
  noteBody: { fontSize: 13, color: colors.text, marginTop: 2 },
  noteLabel: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: 14, marginBottom: 6 },
  addText: { textAlign: 'center', color: colors.textMuted, fontWeight: '700', fontSize: 13, marginTop: 14, paddingVertical: 6 },
  formTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  labelHint: { fontSize: 11, fontWeight: '500', color: colors.textMuted },
  input: {
    borderWidth: 1.5,
    borderColor: '#E5E5E5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    marginBottom: 14,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inputText: { fontSize: 15, color: colors.text },
  unitRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 14 },
  unitChip: { borderWidth: 1.5, borderColor: 'transparent', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  unitChipOn: { borderColor: '#22C55E', backgroundColor: colors.primaryLight },
  unitText: { fontSize: 13, color: colors.text },
  unitTextOn: { color: colors.primary, fontWeight: '700' },
  stepChip: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  stepChipOn: { borderColor: '#22C55E', backgroundColor: colors.primaryLight },
  stepChipText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  addStep: { fontSize: 12, color: colors.textMuted, fontWeight: '700', paddingHorizontal: 8 },
  stepPicker: { maxHeight: 240, borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 10, padding: 8, marginBottom: 14, overflow: 'hidden' },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  pickText: { fontSize: 13, color: colors.text, flex: 1 },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoBox: { width: 64, height: 64, borderRadius: 10, backgroundColor: '#F3F4F6' },
  cameraBox: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#22C55E', backgroundColor: colors.primaryLight },
  galleryBox: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  photoHint: { fontSize: 11, color: colors.textMuted, marginTop: 6 },
  saveBtn: { backgroundColor: colors.primary, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 20, minHeight: 50, justifyContent: 'center' },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelText: { textAlign: 'center', color: colors.textMuted, marginTop: 14 },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center' },
  viewerImg: { width: '100%', height: '80%' },
});
