import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { launchCamera, launchImageLibrary } from '@/imagePicker';
import { api, uploadMaterialCheckPhoto } from '@/api/client';
import { Feather } from '@/components/Feather';
import { showDriveUploadError } from '@/googleDrive';
import { mediaThumbUrl } from '@/media';
import { useAuth } from '@/store/auth';
import { colors, materialCategoryLabel, materialItemStatusMeta } from '@/theme';
import type { MaterialCategory, MaterialCheck, MaterialCheckItem, MaterialDeliveryBatch, Phase, Project } from '@/types';

const CATEGORIES: MaterialCategory[] = ['THO', 'SON', 'CUA', 'NOI_THAT'];

function fmtMoney(v?: string | null) {
  if (!v) return null;
  const n = Number(v);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}tr`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function fmtDate(iso?: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function BatchRow({
  batch,
  canDecide,
  materialCheckStatus,
  onDecide,
  onComment,
}: {
  batch: MaterialDeliveryBatch;
  canDecide: boolean;
  materialCheckStatus: string;
  onDecide: (batchId: string, approve: boolean, note?: string) => void;
  onComment: (batchId: string, body: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState('');
  const [comment, setComment] = useState('');
  const meta = materialItemStatusMeta[batch.status];
  const canDecideThis = canDecide && materialCheckStatus === 'SUBMITTED' && batch.status === 'PENDING';

  return (
    <View style={styles.batchRow}>
      <TouchableOpacity style={styles.batchHeader} onPress={() => setExpanded((v) => !v)}>
        <Feather name={batch.status === 'PENDING' ? 'clock' : 'package'} size={14} color={meta.color} />
        <View style={{ flex: 1 }}>
          <Text style={styles.batchTitle}>
            Đợt {batch.batchNumber}
            {batch.supplierName ? ` — ${batch.supplierName}` : ''}
          </Text>
          <Text style={styles.batchMeta}>
            {fmtDate(batch.deliveredAt ?? batch.createdAt)}
            {` · ${batch.photos.length} ảnh`}
            {batch.note ? ` · ${batch.note}` : ''}
          </Text>
        </View>
        <Text style={[styles.batchStatusText, { color: meta.color }]}>{meta.label}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.batchBody}>
          <View style={styles.photoGrid}>
            {batch.photos.map((p) => (
              <Image
                key={p.id}
                source={{ uri: mediaThumbUrl(p.objectKey) }}
                style={styles.photoImg}
                contentFit="cover"
              />
            ))}
          </View>

          {batch.comments.length > 0 && (
            <View style={{ gap: 6, marginTop: 8 }}>
              {batch.comments.map((c) => (
                <View key={c.id} style={styles.commentRow}>
                  <Text style={styles.commentAuthor}>{c.author.name}</Text>
                  <Text style={styles.commentBody}>{c.body}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.commentInputRow}>
            <TextInput
              style={styles.commentInput}
              placeholder="Bình luận (thầu/giám sát/chủ nhà)…"
              value={comment}
              onChangeText={setComment}
            />
            <TouchableOpacity
              disabled={!comment.trim()}
              onPress={() => {
                onComment(batch.id, comment.trim());
                setComment('');
              }}
            >
              <Text style={{ color: colors.primary, fontWeight: '700' }}>Gửi</Text>
            </TouchableOpacity>
          </View>

          {canDecideThis && (
            <View style={styles.decideBox}>
              <TextInput
                style={styles.input}
                placeholder="Ghi chú (bắt buộc nếu từ chối)"
                value={note}
                onChangeText={setNote}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={styles.approveBtn}
                  onPress={() => onDecide(batch.id, true)}
                >
                  <Text style={styles.approveBtnText}>Đạt</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.rejectBtn}
                  onPress={() => {
                    if (!note.trim()) {
                      Alert.alert('Cần ghi chú', 'Ghi rõ lý do từ chối đợt này.');
                      return;
                    }
                    onDecide(batch.id, false, note.trim());
                  }}
                >
                  <Text style={styles.rejectBtnText}>Từ chối</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

export default function MaterialCheckScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const [activeCategory, setActiveCategory] = useState<MaterialCategory>('THO');
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<MaterialCategory>('THO');
  const [supplierName, setSupplierName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [expandedStepsForItem, setExpandedStepsForItem] = useState<string | null>(null);

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/projects'),
  });
  const project = projects?.find((p) => p.id === projectId);
  const myRole = project?.members.find((m) => m.userId === user?.id)?.role;
  // Cả 2 phía đều khai báo vật tư được — MAIN_CONTRACTOR (thầu tập kết, luồng gốc) và OWNER (chủ
  // nhà tự khai vật tư đã có sẵn). Bên duyệt luôn là bên đối diện với bên đã khai báo item, xem
  // canDecideItem/canManageItem bên dưới (khác `MaterialCheckService.deciderRoleFor`, backend).
  const canUpload = myRole === 'MAIN_CONTRACTOR' || myRole === 'OWNER';
  const canManageItem = (item: MaterialCheckItem) => myRole === item.submittedByRole;
  const canDecideItem = (item: MaterialCheckItem) =>
    !!myRole && myRole !== item.submittedByRole && (myRole === 'OWNER' || myRole === 'MAIN_CONTRACTOR');

  const { data: check, isLoading } = useQuery({
    queryKey: ['material-check', projectId],
    queryFn: () => api<MaterialCheck>(`/projects/${projectId}/material-check`),
    enabled: !!projectId,
  });

  const { data: phases } = useQuery({
    queryKey: ['phases', projectId],
    queryFn: () => api<Phase[]>(`/projects/${projectId}/phases`),
    enabled: !!projectId && canUpload,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['material-check', projectId] });
    qc.invalidateQueries({ queryKey: ['projects'] });
  };

  const pickAndUpload = async (useCamera: boolean) => {
    if (!label.trim()) {
      Alert.alert('Cần đặt tên loại vật tư', 'VD: Xi măng Hà Tiên, Thép Việt-Nhật... để bên còn lại duyệt từng loại riêng.');
      return;
    }
    const picker = useCamera ? launchCamera : launchImageLibrary;
    const result = await picker({ mediaType: 'photo', quality: 0.6 });
    if (result.didCancel || !result.assets?.[0]?.uri) return;
    const asset = result.assets[0];
    setUploading(true);
    try {
      await uploadMaterialCheckPhoto(
        projectId!,
        asset.uri!,
        asset.type ?? 'image/jpeg',
        label.trim(),
        category,
        supplierName.trim() || undefined,
      );
      // Item mới nằm ở tab theo loại đã chọn trong form, không phải tab đang xem — chuyển sang
      // đúng tab + báo rõ, nếu không user tưởng upload không ăn.
      setActiveCategory(category);
      Alert.alert('Đã thêm ảnh', `"${label.trim()}" — xem ở mục ${materialCategoryLabel[category]}.`);
      setLabel('');
      setSupplierName('');
      refresh();
    } catch (e) {
      showDriveUploadError((e as Error).message, !!project?.canManageDrive);
    } finally {
      setUploading(false);
    }
  };

  const updateDetails = useMutation({
    mutationFn: (p: { itemId: string; category?: MaterialCategory; quantityLabel?: string; unitPrice?: number; contractValue?: number; stepIds?: string[] }) =>
      api(`/material-check-items/${p.itemId}`, { method: 'PATCH', body: p }),
    onSuccess: refresh,
    onError: (e) => Alert.alert('Lỗi', (e as Error).message),
  });

  const submit = useMutation({
    mutationFn: () => api(`/projects/${projectId}/material-check/submit`, { method: 'POST' }),
    onSuccess: () => {
      refresh();
      Alert.alert('Đã nộp', 'Chờ bên còn lại kiểm tra số lượng và duyệt từng loại.');
    },
    onError: (e) => Alert.alert('Chưa nộp được', (e as Error).message),
  });

  const decideBatch = useMutation({
    mutationFn: ({ batchId, approve, note }: { batchId: string; approve: boolean; note?: string }) =>
      api(`/material-batches/${batchId}/decide`, { method: 'POST', body: { approve, note } }),
    onSuccess: refresh,
    onError: (e) => Alert.alert('Lỗi', (e as Error).message),
  });

  const postComment = useMutation({
    mutationFn: ({ batchId, body }: { batchId: string; body: string }) =>
      api(`/material-batches/${batchId}/comments`, { method: 'POST', body: { body } }),
    onSuccess: refresh,
    onError: (e) => Alert.alert('Lỗi', (e as Error).message),
  });

  const items = check?.items ?? [];
  const editable = canUpload && check?.status !== 'APPROVED';
  const canSubmit = canUpload && (check?.status === 'PENDING' || check?.status === 'REJECTED');

  const approvedCount = items.filter((i) => i.status === 'APPROVED').length;
  const pendingCount = items.filter((i) => i.status === 'PENDING').length;
  const rejectedCount = items.filter((i) => i.status === 'REJECTED').length;
  const confirmedPercent = items.length > 0 ? Math.round((approvedCount / items.length) * 100) : 0;

  const filteredItems = items.filter((i) => i.category === activeCategory);
  const allSteps = (phases ?? []).flatMap((p) => p.steps.map((s) => ({ ...s, phaseCode: p.code })));

  const toggleStepForItem = (item: MaterialCheckItem, stepId: string) => {
    const current = item.steps.map((s) => s.id);
    const next = current.includes(stepId) ? current.filter((id) => id !== stepId) : [...current, stepId];
    updateDetails.mutate({ itemId: item.id, stepIds: next });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          Trước khi bắt đầu thi công, thầu cần chụp ảnh vật liệu tập kết theo từng loại, chỉ rõ dùng
          cho hạng mục nào, để chủ nhà kiểm tra và duyệt. Chủ nhà cũng có thể tự khai vật tư mình đã
          có sẵn (VD mua trước 100 thùng gạch) để thầu chính tiếp nhận, kiểm tra số lượng.
        </Text>
      </View>

      {isLoading && <Text style={styles.empty}>Đang tải…</Text>}

      {items.length > 0 && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>TỔNG TIẾN ĐỘ VẬT TƯ</Text>
          <View style={styles.summaryStatRow}>
            <View style={styles.summaryStat}>
              <Text style={[styles.summaryStatValue, { color: colors.success }]}>{approvedCount}</Text>
              <Text style={styles.summaryStatLabel}>ĐÃ DUYỆT</Text>
            </View>
            <View style={styles.summaryStat}>
              <Text style={[styles.summaryStatValue, { color: colors.warning }]}>{pendingCount}</Text>
              <Text style={styles.summaryStatLabel}>CHỜ</Text>
            </View>
            <View style={styles.summaryStat}>
              <Text style={[styles.summaryStatValue, { color: colors.danger }]}>{rejectedCount}</Text>
              <Text style={styles.summaryStatLabel}>TỪ CHỐI</Text>
            </View>
          </View>
          <View style={styles.summaryBarTrack}>
            <View style={[styles.summaryBarFill, { width: `${confirmedPercent}%` }]} />
          </View>
          <Text style={styles.summaryFootnote}>
            {items.length} loại · {confirmedPercent}% xác nhận
          </Text>
        </View>
      )}

      <View style={styles.tabRow}>
        {CATEGORIES.map((c) => {
          const count = items.filter((i) => i.category === c).length;
          const active = activeCategory === c;
          return (
            <TouchableOpacity
              key={c}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setActiveCategory(c)}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {materialCategoryLabel[c]} ({count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {filteredItems.length === 0 && (
        <Text style={styles.empty}>Chưa có loại vật tư nào trong nhóm này.</Text>
      )}

      {filteredItems.map((item) => {
        const itemMeta = materialItemStatusMeta[item.status];
        const priceLine = [item.quantityLabel, item.unitPrice ? `Đơn giá ${fmtMoney(item.unitPrice)}đ` : null, item.contractValue ? `HĐ ${fmtMoney(item.contractValue)}` : null]
          .filter(Boolean)
          .join(' · ');
        return (
          <View key={item.id} style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemLabel}>{item.label}</Text>
                <Text style={styles.itemSubmitter}>
                  {item.submittedByRole === 'OWNER' ? 'Chủ nhà khai báo' : 'Thầu chính khai báo'}
                </Text>
              </View>
              {item.status === 'APPROVED' ? (
                <Feather name="check-circle" size={18} color={colors.success} />
              ) : item.status === 'REJECTED' ? (
                <Feather name="x-circle" size={18} color={colors.danger} />
              ) : (
                <Feather name="clock" size={18} color={itemMeta.color} />
              )}
            </View>
            {!!priceLine && <Text style={styles.priceLine}>{priceLine}</Text>}

            <TouchableOpacity
              style={styles.stepsRow}
              disabled={!canManageItem(item)}
              onPress={() => setExpandedStepsForItem((v) => (v === item.id ? null : item.id))}
            >
              <Feather name="link" size={11} color={colors.primary} />
              <Text style={styles.stepsText}>
                {item.steps.length > 0
                  ? `Dùng cho:\n${item.steps.map((s) => `• ${s.phase.code}.${s.order} ${s.name}`).join('\n')}`
                  : canManageItem(item)
                    ? 'Chưa gán hạng mục — bấm để chọn'
                    : 'Chưa gán hạng mục'}
              </Text>
            </TouchableOpacity>

            {expandedStepsForItem === item.id && canManageItem(item) && (
              // View ngoài giữ maxHeight + overflow hidden để clip (ScrollView tự đặt maxHeight vẫn tràn
              // đè "LỊCH SỬ TẬP KẾT" trên Android); ScrollView trong để cuộn.
              <View style={styles.stepPicker}>
              <ScrollView nestedScrollEnabled>
                {allSteps.map((s) => {
                  const checked = item.steps.some((x) => x.id === s.id);
                  return (
                    <TouchableOpacity
                      key={s.id}
                      style={styles.stepPickerRow}
                      onPress={() => toggleStepForItem(item, s.id)}
                    >
                      <Feather
                        name={checked ? 'check-square' : 'square'}
                        size={14}
                        color={checked ? colors.primary : colors.textMuted}
                      />
                      <Text style={styles.stepPickerText}>
                        {s.phaseCode}.{s.order} {s.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              </View>
            )}

            <Text style={styles.batchesHeader}>LỊCH SỬ TẬP KẾT</Text>
            {item.batches.map((batch) => (
              <BatchRow
                key={batch.id}
                batch={batch}
                canDecide={canDecideItem(item)}
                materialCheckStatus={check?.status ?? 'PENDING'}
                onDecide={(batchId, approve, note) => decideBatch.mutate({ batchId, approve, note })}
                onComment={(batchId, body) => postComment.mutate({ batchId, body })}
              />
            ))}
          </View>
        );
      })}

      {editable && (
        <View style={styles.uploadBox}>
          <Text style={styles.uploadBoxTitle}>Thêm loại vật tư / tập kết đợt mới</Text>
          <TextInput
            style={styles.input}
            placeholder="Tên loại vật tư (VD: Xi măng Hà Tiên...)"
            value={label}
            onChangeText={setLabel}
          />
          <View style={styles.categoryPickRow}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.categoryChip, category === c && styles.categoryChipActive]}
                onPress={() => setCategory(c)}
              >
                <Text style={[styles.categoryChipText, category === c && styles.categoryChipTextActive]}>
                  {materialCategoryLabel[c]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={styles.input}
            placeholder="Nhà cung cấp (tuỳ chọn)"
            value={supplierName}
            onChangeText={setSupplierName}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={[styles.uploadBtn, uploading && { opacity: 0.6 }]}
              disabled={uploading}
              onPress={() => pickAndUpload(true)}
            >
              <Text style={styles.uploadBtnText}>Chụp ảnh</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.uploadBtn, uploading && { opacity: 0.6 }]}
              disabled={uploading}
              onPress={() => pickAndUpload(false)}
            >
              <Text style={styles.uploadBtnText}>Thư viện</Text>
            </TouchableOpacity>
          </View>
          {uploading && <ActivityIndicator style={{ marginTop: 8 }} color={colors.primary} />}

          {canSubmit && (
            <TouchableOpacity
              style={[styles.submitBtn, (submit.isPending || items.length === 0) && { opacity: 0.5 }]}
              disabled={submit.isPending || items.length === 0}
              onPress={() => submit.mutate()}
            >
              <Text style={styles.submitBtnText}>
                {submit.isPending ? 'Đang nộp…' : 'Nộp để kiểm tra'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {check?.status === 'APPROVED' && (
        <Text style={styles.approvedHint}>
          Vật tư đã được duyệt, có thể tiếp tục duyệt kế hoạch thi công.
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  notice: { backgroundColor: colors.primaryLight, borderRadius: 12, padding: 12, marginBottom: 12 },
  noticeText: { color: colors.primary, fontSize: 12, lineHeight: 18 },
  empty: { color: colors.textMuted, marginBottom: 12 },
  summaryCard: { backgroundColor: '#17202A', borderRadius: 16, padding: 16, marginBottom: 14 },
  summaryTitle: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  summaryStatRow: { flexDirection: 'row', marginTop: 10, gap: 8 },
  summaryStat: { flex: 1, alignItems: 'center' },
  summaryStatValue: { fontSize: 20, fontWeight: '800' },
  summaryStatLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '700', marginTop: 2 },
  summaryBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
    marginTop: 12,
  },
  summaryBarFill: { height: '100%', borderRadius: 3, backgroundColor: colors.warning },
  summaryFootnote: { color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 6 },
  tabRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  tab: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  tabActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  tabText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  tabTextActive: { color: colors.primary },
  itemCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemLabel: { fontWeight: '700', color: colors.text, fontSize: 14 },
  itemSubmitter: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
  priceLine: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: colors.primaryLight,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  stepsText: { color: colors.primary, fontSize: 12, fontWeight: '600', flexShrink: 1, lineHeight: 18 },
  stepPicker: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 8,
    maxHeight: 220,
    overflow: 'hidden',
  },
  stepPickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  stepPickerText: { fontSize: 12, color: colors.text, flex: 1 },
  batchesHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 6,
  },
  batchRow: {
    backgroundColor: colors.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
    overflow: 'hidden',
  },
  batchHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10 },
  batchTitle: { fontSize: 12, fontWeight: '700', color: colors.text },
  batchMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  batchStatusText: { fontSize: 11, fontWeight: '700' },
  batchBody: { padding: 10, paddingTop: 0 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoImg: { width: 64, height: 64, borderRadius: 8, backgroundColor: colors.border },
  commentRow: { backgroundColor: colors.card, borderRadius: 8, padding: 8 },
  commentAuthor: { fontSize: 11, fontWeight: '700', color: colors.primary },
  commentBody: { fontSize: 12, color: colors.text, marginTop: 2 },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: colors.card,
  },
  commentInput: { flex: 1, fontSize: 12, paddingVertical: 8 },
  decideBox: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    fontSize: 13, color: colors.text,
  },
  approveBtn: { flex: 1, backgroundColor: colors.success, borderRadius: 10, padding: 10, alignItems: 'center' },
  approveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  rejectBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  rejectBtnText: { color: colors.danger, fontWeight: '700', fontSize: 13 },
  uploadBox: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  uploadBoxTitle: { fontWeight: '700', color: colors.text, fontSize: 13, marginBottom: 10 },
  categoryPickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  categoryChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  categoryChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  categoryChipText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  categoryChipTextActive: { color: '#fff' },
  uploadBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  uploadBtnText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  submitBtnText: { color: '#fff', fontWeight: '700' },
  approvedHint: { textAlign: 'center', color: colors.success, fontWeight: '700', marginBottom: 20 },
});
