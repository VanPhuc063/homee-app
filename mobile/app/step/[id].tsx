import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
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
import { api, approveStepWithEquipmentPhoto, uploadEvidence } from '@/api/client';
import { AiLocked, useAiUnlocked } from '@/ai/AiLocked';
import { AfterReportSheet, useAdsAllowed, useAfterReportSheet } from '@/ads/Ads';
import { Feather } from '@/components/Feather';
import { showDriveUploadError } from '@/googleDrive';
import { compressIfVideo } from '@/offline/compress';
import { enqueueEvidence, isNetworkError, runOrQueue, usePendingUploads } from '@/offline/uploadQueue';
import { mediaOpenUrl, mediaThumbUrl } from '@/media';
import { useAuth } from '@/store/auth';
import { colors, roleColor, roleLabel, stepStatusMeta } from '@/theme';
import type { AiStepReview, CommentT, Evidence, Project, Step } from '@/types';

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

function CommentRow({ c }: { c: CommentT }) {
  const color = (c.author.role && roleColor[c.author.role]) || colors.locked;
  return (
    <View style={styles.commentRow}>
      <View style={styles.commentHeader}>
        <View style={[styles.commentAvatar, { backgroundColor: color }]}>
          <Text style={styles.commentAvatarText}>{initials(c.author.name)}</Text>
        </View>
        <Text style={styles.commentAuthor}>{c.author.name}</Text>
        {!!c.author.role && (
          <Text style={[styles.commentRoleBadge, { color, backgroundColor: color + '1A' }]}>
            {roleLabel[c.author.role]}
          </Text>
        )}
      </View>
      <Text style={styles.commentBody}>{c.body}</Text>
    </View>
  );
}

export default function StepDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const [comment, setComment] = useState('');
  const [uploading, setUploading] = useState(false);
  const [viewerEvidenceId, setViewerEvidenceId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>(null);
  // Alert.prompt chỉ có trên iOS (undefined trên Android, khiến từ chối không kèm ghi chú lại tự
  // động submit ngay không hỏi gì) — dùng ô nhập inline thay vì phụ thuộc API đó.
  const [rejectNote, setRejectNote] = useState('');
  // "Book giám sát" — giám sát bắt buộc chụp ảnh thiết bị đo trước khi duyệt/từ chối, làm bằng
  // chứng cho chủ đầu tư (xem WorkflowService.approveStep). Chủ nhà duyệt lớp 2 thì không cần.
  const [equipmentPhoto, setEquipmentPhoto] = useState<{ uri: string; type: string } | null>(null);
  const [capturingEquipment, setCapturingEquipment] = useState(false);

  const { data: step } = useQuery({
    queryKey: ['step', id],
    queryFn: () => api<Step>(`/steps/${id}`),
    enabled: !!id,
  });

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/projects'),
  });
  const project = projects?.find((p) => p.id === step?.phase?.projectId);
  const myMember = project?.members.find((m) => m.userId === user?.id);
  const myRole = myMember?.role;
  // Thầu phụ chỉ thao tác trên hạng mục được gán — khớp với `requireContractor` ở backend
  // (workflow.service.ts), tránh hiện nút chụp/nộp ảnh rồi bị backend từ chối.
  const isPhaseAssigned =
    myRole !== 'SUB_CONTRACTOR' ||
    (!!step?.phase?.code && !!myMember?.assignedPhaseCodes.includes(step.phase.code));

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['step', id] });
    qc.invalidateQueries({ queryKey: ['phases'] });
  };

  const pickAndUpload = async (useCamera: boolean) => {
    const picker = useCamera ? launchCamera : launchImageLibrary;
    const result = await picker({ mediaType: 'mixed', quality: 0.6, durationLimit: 60, videoQuality: 'medium' });
    if (result.didCancel || !result.assets?.[0]?.uri) return;
    const asset = result.assets[0];
    setUploading(true);
    const type = asset.type ?? (asset.duration != null ? 'video/mp4' : 'image/jpeg');
    const uri = await compressIfVideo(asset.uri!, type);
    try {
      await uploadEvidence(id!, uri, type);
      refresh();
    } catch (e) {
      if (isNetworkError(e)) {
        // Mất sóng ở công trường: lưu tạm, tự tải lên khi có mạng.
        await enqueueEvidence(id!, uri, type);
        Alert.alert('Đã lưu tạm', 'Không có mạng — ảnh/video sẽ tự tải lên khi có sóng trở lại.');
        return;
      }
      showDriveUploadError((e as Error).message, !!project?.canManageDrive);
    } finally {
      setUploading(false);
    }
  };

  const pendingUploads = usePendingUploads();
  const aiUnlocked = useAiUnlocked(project?.id);
  const sheet = useAfterReportSheet();
  const adsAllowed = useAdsAllowed(myRole);
  const submitStep = useMutation({
    mutationFn: () => api(`/steps/${id}/submit`, { method: 'POST' }),
    onSuccess: async () => {
      refresh();
      if (!(await sheet.maybeShow(aiUnlocked, adsAllowed))) Alert.alert('Đã gửi báo cáo!', 'Chờ giám sát kiểm tra và duyệt.');
    },
    onError: (e) => Alert.alert('Chưa nộp được', (e as Error).message),
  });

  const approve = useMutation({
    mutationFn: (p: { decision: 'APPROVED' | 'REJECTED'; note?: string }) =>
      api(`/steps/${id}/approve`, { method: 'POST', body: p }),
    onSuccess: refresh,
    onError: (e) => Alert.alert('Lỗi', (e as Error).message),
  });

  const approveAsSupervisor = useMutation({
    mutationFn: (p: { decision: 'APPROVED' | 'REJECTED'; note?: string }) =>
      approveStepWithEquipmentPhoto(id!, p.decision, equipmentPhoto!.uri, equipmentPhoto!.type, p.note),
    onSuccess: () => {
      setEquipmentPhoto(null);
      refresh();
    },
    onError: (e) => showDriveUploadError((e as Error).message, !!project?.canManageDrive),
  });

  const captureEquipmentPhoto = async () => {
    const result = await launchCamera({ mediaType: 'photo', quality: 0.6 });
    if (result.didCancel || !result.assets?.[0]?.uri) return;
    setCapturingEquipment(true);
    try {
      setEquipmentPhoto({ uri: result.assets[0].uri!, type: result.assets[0].type ?? 'image/jpeg' });
    } finally {
      setCapturingEquipment(false);
    }
  };

  const addComment = useMutation({
    mutationFn: (p: { body: string; evidenceId?: string }) =>
      runOrQueue({ kind: 'json', path: `/steps/${id}/comments`, method: 'POST', body: p }),
    onSuccess: (status, variables) => {
      if (status === 'queued') Alert.alert('Đã lưu tạm', 'Không có mạng — sẽ tự gửi khi có sóng trở lại.');
      if (!variables.evidenceId) setComment('');
      refresh();
    },
    onError: (e) => Alert.alert('Lỗi', (e as Error).message),
  });

  if (!step) {
    return <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} />;
  }

  const viewerEvidence: Evidence | null =
    step.evidences.find((e) => e.id === viewerEvidenceId) ?? null;

  const meta = stepStatusMeta[step.status] ?? stepStatusMeta.LOCKED;
  const isContractor = (myRole === 'MAIN_CONTRACTOR' || myRole === 'SUB_CONTRACTOR') && isPhaseAssigned;
  // Giám sát/chủ nhà cũng upload được ảnh khảo sát thực trạng, dù không phải người nộp bước
  // (khớp `requireUploader` ở backend) — thêm được ở bất kỳ trạng thái bước nào. Chỉ thầu mới có
  // nút "Nộp bước" (canSubmit), và chỉ khi bước đang mở/bị từ chối.
  const isReviewerUploader = myRole === 'SUPERVISOR' || myRole === 'OWNER';
  const canUpload = isContractor || isReviewerUploader;
  const canSubmit = isContractor && ['OPEN', 'REJECTED'].includes(step.status);
  const canSupervisorApprove = myRole === 'SUPERVISOR' && step.status === 'SUBMITTED';
  // Không có giám sát phụ trách thì chủ nhà đánh giá luôn bước thầu vừa nộp.
  const canOwnerApprove =
    myRole === 'OWNER' &&
    (step.status === 'SUPERVISOR_APPROVED' || (step.status === 'SUBMITTED' && step.hasSupervisor === false));

  const doApprove = (decision: 'APPROVED' | 'REJECTED', note?: string) => {
    if (canSupervisorApprove) {
      if (!equipmentPhoto) {
        Alert.alert('Cần ảnh thiết bị', 'Chụp ảnh thiết bị đo dùng để nghiệm thu trước khi duyệt/từ chối.');
        return;
      }
      approveAsSupervisor.mutate({ decision, note });
    } else {
      approve.mutate({ decision, note });
    }
  };

  const rejectWithNote = () => {
    doApprove('REJECTED', rejectNote.trim() || undefined);
    setRejectNote('');
  };

  const photoEvidences = step.evidences.filter((e) => e.type === 'PHOTO');
  const videoCount = step.evidences.length - photoEvidences.length;
  const tagMembers = (project?.members ?? []).filter((m) => m.userId !== user?.id);
  const insertTag = (name: string) => setDraft((d) => `${d}${d && !d.endsWith(' ') ? ' ' : ''}@${name} `);
  const sendEvidenceComment = (evidenceId: string) => {
    const body = (drafts[evidenceId] ?? '').trim();
    if (!body) return;
    addComment.mutate({ body, evidenceId });
    setDrafts((p) => ({ ...p, [evidenceId]: '' }));
  };
  const setDraft = (fn: (d: string) => string) =>
    activeEvidenceId && setDrafts((p) => ({ ...p, [activeEvidenceId]: fn(p[activeEvidenceId] ?? '') }));

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      <Text style={styles.subtitle}>
        {step.floorLabel ? `${step.floorLabel} — ` : ''}Bước nhỏ {step.order}: {step.name}
      </Text>
      <View style={styles.row}>
        <Text style={[styles.statusChip, { color: meta.color, borderColor: meta.color }]}>{meta.label}</Text>
        {!!step.acceptance && <Text style={styles.req} numberOfLines={2}>Tiêu chí: {step.acceptance}</Text>}
      </View>
      {myRole === 'SUB_CONTRACTOR' && !isPhaseAssigned && (
        <Text style={styles.mandatoryNote}>Bạn không được gán hạng mục này, chỉ xem được, không thao tác được.</Text>
      )}

      <Text style={styles.section}>
        📷 Ảnh báo cáo — {photoEvidences.length} ảnh{videoCount ? `, ${videoCount} video` : ''}
      </Text>

      {step.evidences.map((e, i) => (
        <View key={e.id} style={styles.evCard}>
          <Text style={styles.evIndex}>
            {i + 1}/{step.evidences.length}
          </Text>
          <TouchableOpacity onPress={() => (e.type === 'VIDEO' ? Linking.openURL(mediaOpenUrl(e.objectKey)) : setViewerEvidenceId(e.id))}>
            <Image source={{ uri: mediaThumbUrl(e.objectKey) }} style={styles.evImage} contentFit="cover" transition={150} />
            {e.type === 'VIDEO' && (
              <View style={styles.playBadge}>
                <Feather name="play" size={18} color="#fff" />
              </View>
            )}
          </TouchableOpacity>
          {(e.comments ?? []).map((c) => (
            <CommentRow key={c.id} c={c} />
          ))}
          <View style={styles.evInputRow}>
            <TextInput
              style={styles.evInput}
              placeholder="Nhập comment..."
              value={drafts[e.id] ?? ''}
              onFocus={() => setActiveEvidenceId(e.id)}
              onChangeText={(v) => setDrafts((p) => ({ ...p, [e.id]: v }))}
            />
            <TouchableOpacity onPress={() => setActiveEvidenceId(e.id)}>
              <Text style={styles.atSign}>@</Text>
            </TouchableOpacity>
            {!!(drafts[e.id] ?? '').trim() && (
              <TouchableOpacity onPress={() => sendEvidenceComment(e.id)}>
                <Feather name="send" size={16} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      ))}

      {pendingUploads > 0 && (
        <Text style={styles.pendingNote}>⏳ {pendingUploads} mục đang chờ mạng để gửi</Text>
      )}
      {canUpload && (
        <View style={styles.uploadRow}>
          <TouchableOpacity style={styles.uploadBtn} onPress={() => pickAndUpload(true)} disabled={uploading}>
            {uploading ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.uploadText}>📷 Chụp ảnh</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.uploadBtn} onPress={() => pickAndUpload(false)} disabled={uploading}>
            <Text style={styles.uploadText}>🖼 Thư viện</Text>
          </TouchableOpacity>
        </View>
      )}

      {tagMembers.length > 0 && (
        <View style={styles.tagBox}>
          <Text style={styles.tagTitle}>@ Tag thành viên</Text>
          <View style={styles.tagRow}>
            {tagMembers.map((m) => (
              <TouchableOpacity
                key={m.userId}
                style={styles.tagChip}
                onPress={() => (activeEvidenceId ? insertTag(m.user.name) : setComment((c) => `${c}@${m.user.name} `))}
              >
                <Text style={styles.tagInitials}>{initials(m.user.name)}</Text>
                <Text style={styles.tagName}>{m.user.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <StepAiPanel stepId={step.id} projectId={project?.id} hasPhotos={photoEvidences.length > 0} stepName={step.name} />

      {canSubmit && (
        <TouchableOpacity style={styles.primaryBtn} onPress={() => submitStep.mutate()}>
          <Text style={styles.primaryBtnText}>Gửi báo cáo cho giám sát</Text>
        </TouchableOpacity>
      )}

      {(canSupervisorApprove || canOwnerApprove) && (
        <View style={styles.reviewBox}>
          <View style={styles.reviewTitleRow}>
            <Feather name="shield" size={16} color={colors.ai} />
            <Text style={styles.reviewTitle}>{canSupervisorApprove ? 'Giám sát đánh giá' : 'Chủ nhà đánh giá'}</Text>
          </View>
          {canSupervisorApprove && (
            <View style={styles.equipmentBox}>
              <Text style={styles.equipmentHint}>
                Book giám sát: chụp ảnh thiết bị đo dùng để nghiệm thu bước này, làm bằng chứng cho chủ đầu tư.
              </Text>
              {equipmentPhoto ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Image source={{ uri: equipmentPhoto.uri }} style={styles.equipmentThumb} />
                  <TouchableOpacity onPress={captureEquipmentPhoto}>
                    <Text style={{ color: colors.primary, fontWeight: '700' }}>Chụp lại</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.equipmentBtn} onPress={captureEquipmentPhoto} disabled={capturingEquipment}>
                  {capturingEquipment ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Text style={styles.equipmentBtnText}>Chụp ảnh thiết bị</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}
          <View style={styles.decisionRow}>
            <TouchableOpacity
              style={[styles.decisionCard, styles.decisionCardPass, (approve.isPending || approveAsSupervisor.isPending) && { opacity: 0.5 }]}
              disabled={approve.isPending || approveAsSupervisor.isPending}
              onPress={() => doApprove('APPROVED')}
            >
              <Feather name="check-circle" size={22} color={colors.primary} />
              <Text style={[styles.decisionCardText, { color: colors.primary }]}>Đạt</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.decisionCard, styles.decisionCardFail, (approve.isPending || approveAsSupervisor.isPending) && { opacity: 0.5 }]}
              disabled={approve.isPending || approveAsSupervisor.isPending}
              onPress={rejectWithNote}
            >
              <Feather name="x" size={22} color={colors.textMuted} />
              <Text style={[styles.decisionCardText, { color: colors.text }]}>Không đạt</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.evInputRow}>
            <TextInput
              style={styles.evInput}
              placeholder={canSupervisorApprove ? 'Ghi chú giám sát...' : 'Ghi chú chủ nhà...'}
              value={rejectNote}
              onChangeText={setRejectNote}
            />
            <Text style={styles.atSign}>@</Text>
          </View>
        </View>
      )}

      {step.approvals.length > 0 && (
        <>
          <Text style={styles.section}>Lịch sử đánh giá</Text>
          {step.approvals.map((a) => (
            <View key={a.id} style={styles.approvalRow}>
              {!!a.equipmentPhotoKey && <Image source={{ uri: mediaThumbUrl(a.equipmentPhotoKey) }} style={styles.equipmentThumb} />}
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', fontSize: 12, color: a.decision === 'APPROVED' ? colors.success : colors.danger }}>
                  {a.decision === 'APPROVED' ? 'Đạt' : 'Không đạt'}
                </Text>
                <Text style={styles.approvalText}>
                  {a.approver.name} ({a.level === 'SUPERVISOR' ? 'Giám sát' : 'Chủ nhà'})
                  {a.note ? ` · ${a.note}` : ''}
                </Text>
              </View>
            </View>
          ))}
        </>
      )}

      <Text style={styles.section}>Trao đổi chung về bước</Text>
      {(step.comments ?? []).map((c) => (
        <CommentRow key={c.id} c={c} />
      ))}
      <View style={styles.evInputRow}>
        <TextInput
          style={styles.evInput}
          placeholder="Nhập comment..."
          value={comment}
          onFocus={() => setActiveEvidenceId(null)}
          onChangeText={setComment}
          multiline
        />
        <TouchableOpacity disabled={!comment.trim()} onPress={() => addComment.mutate({ body: comment.trim() })}>
          <Feather name="send" size={16} color={comment.trim() ? colors.primary : colors.textMuted} />
        </TouchableOpacity>
      </View>

      <AfterReportSheet
        visible={sheet.visible}
        onClose={() => sheet.setVisible(false)}
        title="Đã gửi báo cáo!"
        subtitle={`${step.phase?.code ?? ''}.${step.order} ${step.name}${step.floorLabel ? ` — ${step.floorLabel}` : ''}`}
        uploaded={`${photoEvidences.length} ảnh${videoCount ? ` + ${videoCount} video` : ''} đã upload`}
      />

      <Modal visible={!!viewerEvidence} transparent animationType="fade" onRequestClose={() => setViewerEvidenceId(null)}>
        <TouchableOpacity style={styles.viewerBackdrop} activeOpacity={1} onPress={() => setViewerEvidenceId(null)}>
          {viewerEvidence && (
            <Image source={{ uri: mediaThumbUrl(viewerEvidence.objectKey) }} style={styles.viewerFull} contentFit="contain" />
          )}
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

/** Khối AI (mockup 13 khoá / 14–15 đã mở khoá). */
function StepAiPanel({
  stepId,
  projectId,
  hasPhotos,
  stepName,
}: {
  stepId: string;
  projectId?: string;
  hasPhotos: boolean;
  stepName: string;
}) {
  const router = useRouter();
  const unlocked = useAiUnlocked(projectId);
  const review = useMutation({
    mutationFn: (force: boolean) => api<AiStepReview>(`/steps/${stepId}/ai/review${force ? '?force=1' : ''}`, { method: 'POST' }),
    onError: (e) => Alert.alert('AI chưa kiểm tra được', (e as Error).message),
  });

  if (unlocked === undefined) return null;
  if (!unlocked) {
    return (
      <AiLocked
        icon="zap"
        title="AI Kiểm tra bằng chứng"
        description="AI sẽ kiểm tra ảnh có đúng chuẩn không: góc chụp đủ, nội dung đúng bước, phát hiện sai sót"
        bullets={[
          '🔍 Kiểm tra ảnh đúng bước thi công',
          '📐 Đánh giá góc chụp: rộng + cận cảnh',
          '⚠️ Phát hiện bất thường: nứt, lệch, thiếu',
          '📋 Yêu cầu bổ sung bằng chứng quan trọng',
        ]}
      />
    );
  }

  const r = review.data;
  if (!r) {
    return (
      <TouchableOpacity
        style={[styles.aiRunBtn, (!hasPhotos || review.isPending) && { opacity: 0.6 }]}
        disabled={!hasPhotos || review.isPending}
        onPress={() => review.mutate(false)}
      >
        {review.isPending ? (
          <ActivityIndicator color={colors.ai} />
        ) : (
          <Text style={styles.aiRunText}>{hasPhotos ? '✨ AI kiểm tra bằng chứng' : '✨ AI kiểm tra (cần ít nhất 1 ảnh)'}</Text>
        )}
      </TouchableOpacity>
    );
  }

  const levelColor = (l: string) => (l === 'OK' ? colors.primary : l === 'NOTE' ? colors.warning : colors.danger);
  const levelLabel = (l: string) => (l === 'OK' ? 'OK' : l === 'NOTE' ? 'Lưu ý' : 'Cảnh báo');
  const verdictLabel = r.verdict === 'PASS' ? '✓ Đủ bằng chứng' : r.verdict === 'WARN' ? '⚠️ Cần bổ sung' : '✕ Thiếu bằng chứng';
  return (
    <View>
      <View style={styles.aiCard}>
        <View style={styles.aiHeader}>
          <Text style={styles.aiTitle}>✨ AI gợi ý</Text>
          <Text style={[styles.aiVerdict, { color: r.verdict === 'PASS' ? colors.primary : r.verdict === 'WARN' ? colors.warning : colors.danger }]}>
            {verdictLabel}
          </Text>
        </View>
        <Text style={styles.aiDisclaimer}>AI chỉ kiểm tra độ đầy đủ của bằng chứng — cần giám sát/chủ nhà xác nhận chất lượng.</Text>
        {r.summary.map((it, i) => (
          <Text key={i} style={styles.aiLine}>
            <Text style={{ color: levelColor(it.level), fontWeight: '700' }}>{levelLabel(it.level)}  </Text>
            {it.text}
          </Text>
        ))}
      </View>

      {r.missing.length > 0 && (
        <View style={styles.missingCard}>
          <Text style={styles.missingTitle}>⚠️ AI yêu cầu bổ sung bằng chứng</Text>
          {r.missing.map((m, i) => (
            <Text key={i} style={styles.missingLine}>
              ❌ <Text style={{ fontWeight: '700' }}>{m.title}</Text> — {m.detail}
            </Text>
          ))}
        </View>
      )}

      {r.checklist.length > 0 && (
        <View style={styles.aiCard}>
          <Text style={styles.aiTitle}>✨ Bằng chứng chuẩn cho bước "{stepName}"</Text>
          {r.checklist.map((c, i) => (
            <Text key={i} style={styles.aiLine}>
              {c.kind === 'VIDEO' ? '🎥' : '📸'} <Text style={{ fontWeight: '700' }}>{i + 1}.</Text> {c.label}{' '}
              <Text style={{ color: c.done ? colors.primary : colors.danger, fontSize: 11 }}>{c.done ? 'Đã có ✓' : 'Thiếu ✗'}</Text>
            </Text>
          ))}
          <Text style={styles.aiFoot}>AI tự gợi ý checklist bằng chứng cho từng bước thi công</Text>
        </View>
      )}

      {r.questions.length > 0 && projectId && (
        <View style={styles.askCard}>
          <Text style={styles.askTitle}>💬 Hỏi AI tư vấn</Text>
          <Text style={styles.askHint}>Gợi ý câu hỏi cho chủ nhà:</Text>
          {r.questions.map((q, i) => (
            <TouchableOpacity key={i} style={styles.askChip} onPress={() => router.push({ pathname: '/ai-chat/[projectId]', params: { projectId, initialQuestion: q } })}>
              <Text style={styles.askChipText}>"{q}"</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <TouchableOpacity onPress={() => review.mutate(true)} disabled={review.isPending}>
        <Text style={styles.aiRerun}>{review.isPending ? 'AI đang kiểm tra lại…' : '↻ Kiểm tra lại'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontSize: 13, color: colors.textMuted },
  evCard: { borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 10, padding: 10, marginBottom: 10 },
  evIndex: { fontSize: 11, color: colors.textMuted, marginBottom: 6 },
  evImage: { width: '100%', height: 180, borderRadius: 8, backgroundColor: '#F3F4F6' },
  playBadge: { position: 'absolute', top: 70, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 24, padding: 12 },
  evInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6', marginTop: 8, paddingTop: 6 },
  evInput: { flex: 1, fontSize: 13, color: colors.text, paddingVertical: 6 },
  atSign: { fontSize: 15, fontWeight: '700', color: '#2563EB' },
  pendingNote: { fontSize: 12, color: '#B45309', backgroundColor: '#FFFBEB', borderRadius: 8, padding: 8, marginBottom: 8 },
  uploadRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  uploadBtn: { flex: 1, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#22C55E', borderRadius: 10, padding: 12, alignItems: 'center' },
  uploadText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  tagBox: { borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 10, padding: 10, marginBottom: 4 },
  tagTitle: { fontSize: 12, fontWeight: '700', color: '#2563EB', marginBottom: 8 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  tagInitials: { fontSize: 9, color: colors.textMuted },
  tagName: { fontSize: 12, color: colors.text },
  reviewBox: { borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 10, padding: 12, marginTop: 14 },
  reviewTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  reviewTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  viewerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  viewerFull: { width: '100%', height: '80%' },
  aiRunBtn: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C4B5FD', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 12 },
  aiRunText: { color: colors.ai, fontWeight: '800' },
  aiCard: { borderWidth: 1, borderColor: '#E5E5E5', borderLeftWidth: 4, borderLeftColor: colors.ai, borderRadius: 10, padding: 12, marginTop: 12 },
  aiHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  aiTitle: { fontSize: 14, fontWeight: '800', color: '#5B21B6', marginBottom: 6 },
  aiVerdict: { fontSize: 12, fontWeight: '800' },
  aiDisclaimer: { fontSize: 11, color: colors.textMuted, fontStyle: 'italic', marginBottom: 4 },
  aiLine: { fontSize: 12, color: colors.text, marginTop: 4, lineHeight: 17 },
  aiFoot: { fontSize: 11, color: colors.textMuted, marginTop: 8 },
  missingCard: { borderWidth: 1, borderColor: '#FECACA', borderLeftWidth: 4, borderLeftColor: colors.danger, borderRadius: 10, padding: 12, marginTop: 12 },
  missingTitle: { fontSize: 14, fontWeight: '800', color: colors.danger, marginBottom: 6 },
  missingLine: { fontSize: 12, color: colors.text, marginTop: 4, lineHeight: 17 },
  askCard: { borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 10, padding: 12, marginTop: 12 },
  askTitle: { fontSize: 14, fontWeight: '800', color: '#5B21B6' },
  askHint: { fontSize: 12, color: colors.textMuted, marginTop: 4, marginBottom: 6 },
  askChip: { borderWidth: 1, borderColor: '#DDD6FE', borderRadius: 8, padding: 10, marginTop: 6 },
  askChipText: { fontSize: 12, color: '#6D28D9' },
  aiRerun: { textAlign: 'center', color: colors.textMuted, fontSize: 12, marginTop: 10 },
  container: { flex: 1, backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { fontSize: 17, fontWeight: '800', color: colors.text },
  acceptance: { color: colors.textMuted, marginTop: 6, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  statusChip: {
    fontSize: 12,
    fontWeight: '700',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  req: { color: colors.textMuted, fontSize: 13 },
  mandatoryNote: {
    marginTop: 10,
    backgroundColor: '#FEF3C7',
    color: '#92400E',
    padding: 10,
    borderRadius: 10,
    fontSize: 12,
    lineHeight: 18,
    overflow: 'hidden',
  },
  section: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 20, marginBottom: 8 },
  hint: { color: colors.textMuted, fontSize: 12, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumbWrap: { position: 'relative' },
  thumb: { width: 104, height: 104, borderRadius: 12, backgroundColor: colors.border },
  videoTag: { position: 'absolute', top: 6, right: 6 },
  commentCountTag: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  uploaderTag: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    maxWidth: 76,
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  viewerContainer: { flex: 1, backgroundColor: colors.bg },
  viewerClose: { padding: 16, alignSelf: 'flex-end' },
  viewerCloseText: { color: colors.primary, fontWeight: '700', fontSize: 15 },
  viewerImage: { width: '100%', height: 360, borderRadius: 12, backgroundColor: '#000' },
  viewerVideoBox: {
    width: '100%',
    height: 240,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 16,
  },
  viewerVideoLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted, letterSpacing: 1 },
  viewerVideoText: { color: colors.textMuted, textAlign: 'center', fontSize: 13 },
  uploaderText: { color: colors.textMuted, fontSize: 12, marginTop: 10 },
  addThumb: {
    width: 104,
    height: 104,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
  },
  addThumbText: { color: colors.primary, fontSize: 12, marginTop: 4, fontWeight: '600' },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  decisionLabel: { fontWeight: '700', color: colors.text, fontSize: 13, marginTop: 16, marginBottom: 8 },
  decisionRow: { flexDirection: 'row', gap: 10 },
  decisionCard: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingVertical: 16,
  },
  decisionCardPass: { borderColor: colors.success, backgroundColor: `${colors.success}0D` },
  decisionCardFail: { borderColor: colors.danger, backgroundColor: `${colors.danger}0D` },
  decisionCardText: { fontWeight: '700', fontSize: 14 },
  rejectNoteInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    marginTop: 16,
    fontSize: 13, color: colors.text,
  },
  approvalRow: { flexDirection: 'row', gap: 8, marginBottom: 6, alignItems: 'center' },
  approvalText: { color: colors.text },
  equipmentBox: {
    marginTop: 16,
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
    padding: 12,
  },
  equipmentHint: { color: colors.primary, fontSize: 12, lineHeight: 17, marginBottom: 8 },
  equipmentBtn: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  equipmentBtnText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  equipmentThumb: { width: 48, height: 48, borderRadius: 8, backgroundColor: colors.border },
  commentRow: { backgroundColor: colors.card, borderRadius: 10, padding: 10, marginBottom: 6 },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  commentAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  commentAuthor: { fontWeight: '700', fontSize: 13, color: colors.primary },
  commentRoleBadge: {
    fontSize: 10,
    fontWeight: '700',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  commentBody: { color: colors.text, marginTop: 2, marginLeft: 30 },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    marginTop: 8,
  },
  commentInput: { flex: 1, maxHeight: 90, fontSize: 14 },
});
