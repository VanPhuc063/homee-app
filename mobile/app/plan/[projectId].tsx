import { Feather } from '@/components/Feather';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { Link, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { api, uploadPlanImport } from '@/api/client';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type {
  AvailablePhase,
  ImportScheduleComparison,
  ImportScheduleDraftPhase,
  Phase,
  PlanChangeRequest,
  PlanChangeType,
  Project,
  Step,
} from '@/types';

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function describeRequest(req: PlanChangeRequest, phases: Phase[] | undefined) {
  const phaseName = (id: string) => phases?.find((p) => p.id === id)?.name ?? id;
  const stepName = (id: string) => phases?.flatMap((p) => p.steps).find((s) => s.id === id)?.name ?? id;
  switch (req.type) {
    case 'ADD_PHASE':
      return req.payload.code
        ? `Thêm hạng mục chuẩn "${req.payload.code}"`
        : `Thêm hạng mục tuỳ chỉnh "${req.payload.name}"`;
    case 'REMOVE_PHASE':
      return `Xoá hạng mục "${phaseName(req.payload.phaseId)}"`;
    case 'ADD_STEP':
      return `Thêm bước "${req.payload.name}" vào hạng mục "${phaseName(req.payload.phaseId)}"`;
    case 'REMOVE_STEP':
      return `Xoá bước "${stepName(req.payload.stepId)}"`;
    case 'ADJUST_DURATION':
      return `Đổi thời gian hạng mục "${phaseName(req.payload.phaseId)}" thành ${req.payload.plannedDurationDays} ngày`;
    case 'IMPORT_SCHEDULE':
      return `Import tiến độ thi công mới từ file "${req.payload.sourceFileName ?? 'đã tải lên'}"`;
    default:
      return 'Thay đổi kế hoạch';
  }
}

/** Panel chi tiết cho đề xuất IMPORT_SCHEDULE — thay vì chỉ hiện 1 dòng mô tả như các loại đề xuất
 * khác, hiện luôn bản nháp AI đã map (số hạng mục/bước) + so sánh với quy trình chuẩn để chủ nhà
 * hiểu rõ trước khi duyệt 1 lần cho toàn bộ tiến độ mới. */
function ImportScheduleReviewPanel({ req }: { req: PlanChangeRequest }) {
  const draftPhases = (req.payload.draftPhases ?? []) as ImportScheduleDraftPhase[];
  const comparison = req.payload.comparison as ImportScheduleComparison | undefined;
  const stepCount = draftPhases.reduce((sum, p) => sum + p.steps.length, 0);

  return (
    <View style={styles.importPanel}>
      <Text style={styles.importSummary}>
        {draftPhases.length} hạng mục · {stepCount} bước, thay thế toàn bộ kế hoạch hiện tại
      </Text>
      {!!comparison?.narrative && <Text style={styles.importNarrative}>{comparison.narrative}</Text>}
      {!!comparison?.missingFromImport.length && (
        <View style={styles.importDiffRow}>
          <Feather name="minus-circle" size={13} color={colors.danger} />
          <Text style={styles.importDiffText}>
            Thiếu so với chuẩn: {comparison.missingFromImport.join(', ')}
          </Text>
        </View>
      )}
      {!!comparison?.addedByContractor.length && (
        <View style={styles.importDiffRow}>
          <Feather name="plus-circle" size={13} color={colors.success} />
          <Text style={styles.importDiffText}>
            Thầu thêm ngoài chuẩn: {comparison.addedByContractor.join(', ')}
          </Text>
        </View>
      )}
      <View style={{ marginTop: 8 }}>
        {draftPhases.map((p, i) => (
          <Text key={i} style={styles.importPhaseLine}>
            {p.code ? `${p.code}. ` : ''}
            {p.name} — {p.steps.length} bước{p.plannedDurationDays ? ` · ${p.plannedDurationDays} ngày` : ''}
          </Text>
        ))}
      </View>
    </View>
  );
}

function DurationRow({
  phase,
  canEdit,
  canPropose,
  onSaveDirect,
  onPropose,
}: {
  phase: Phase;
  canEdit: boolean;
  canPropose: boolean;
  onSaveDirect: (days: number) => void;
  onPropose: (days: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(phase.plannedDurationDays));

  // Alert.prompt chỉ có trên iOS (undefined trên Android) — dùng lại đúng ô nhập inline có sẵn cho
  // cả 2 trường hợp (sửa trực tiếp / đề xuất) thay vì phụ thuộc API không chạy được trên Android.
  const startEditing = () => {
    setValue(String(phase.plannedDurationDays));
    setEditing(true);
  };

  const save = () => {
    const days = Number(value);
    if (!days || days < 1) return Alert.alert('Lỗi', 'Số ngày không hợp lệ');
    if (canEdit) onSaveDirect(days);
    else onPropose(days);
    setEditing(false);
  };

  if (editing) {
    return (
      <View style={styles.durationRow}>
        <Feather name="clock" size={13} color={colors.textMuted} />
        <TextInput
          style={styles.durationInput}
          keyboardType="number-pad"
          value={value}
          onChangeText={setValue}
          autoFocus
        />
        <Text style={styles.durationUnit}>ngày</Text>
        <TouchableOpacity style={styles.durationSaveBtn} onPress={save}>
          <Text style={styles.durationSaveText}>{canEdit ? 'Lưu' : 'Gửi đề xuất'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.durationRow}>
      <Feather name="clock" size={13} color={colors.textMuted} />
      <Text style={styles.durationText}>Dự kiến {phase.plannedDurationDays} ngày</Text>
      {canEdit && (
        <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={startEditing}>
          <Feather name="edit-2" size={12} color={colors.primary} />
        </TouchableOpacity>
      )}
      {!canEdit && canPropose && (
        <TouchableOpacity onPress={startEditing}>
          <Text style={styles.proposeLink}>Đề xuất đổi</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function PhasePlanCard({
  phase,
  index,
  canEdit,
  canPropose,
  isOwner,
  onChanged,
  onPropose,
  draggingIndex,
  dragY,
  onLayoutRow,
  onDragEndRow,
  onDragStart,
}: {
  phase: Phase;
  index: number;
  canEdit: boolean;
  canPropose: boolean;
  isOwner: boolean;
  onChanged: () => void;
  onPropose: (type: PlanChangeType, payload: Record<string, any>) => void;
  draggingIndex: SharedValue<number>;
  dragY: SharedValue<number>;
  onLayoutRow: (index: number, y: number, height: number) => void;
  onDragEndRow: (index: number, translationY: number) => void;
  onDragStart: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState('');
  const [acceptance, setAcceptance] = useState('');
  const [minPhotos, setMinPhotos] = useState('1');
  const [requiresVideo, setRequiresVideo] = useState(false);
  const [mandatory, setMandatory] = useState(false);
  // Bước lặp theo tầng (floorLabel != null, VD B-07/B-15/B-17 "Tầng trệt") — bấm "+" để
  // nhân bản thêm cho tầng khác thay vì gõ lại từ đầu qua form "Thêm bước thương lượng".
  const [floorPromptStepId, setFloorPromptStepId] = useState<string | null>(null);
  const [newFloorLabel, setNewFloorLabel] = useState('');

  const canRemovePhase = (canEdit || canPropose) && phase.status === 'LOCKED';

  const addStep = useMutation({
    mutationFn: () =>
      api(`/phases/${phase.id}/steps`, {
        method: 'POST',
        body: {
          name,
          acceptance: acceptance || undefined,
          minPhotos: Number(minPhotos) || 1,
          requiresVideo,
          mandatory,
        },
      }),
    onSuccess: () => {
      setName('');
      setAcceptance('');
      setMinPhotos('1');
      setRequiresVideo(false);
      setMandatory(false);
      onChanged();
    },
    onError: (e) => Alert.alert('Lỗi', (e as Error).message),
  });

  const submitAddStep = () => {
    if (canEdit) {
      addStep.mutate();
      return;
    }
    onPropose('ADD_STEP', {
      phaseId: phase.id,
      name,
      acceptance: acceptance || undefined,
      minPhotos: Number(minPhotos) || 1,
      requiresVideo,
      mandatory,
    });
    setName('');
    setAcceptance('');
    setMinPhotos('1');
    setRequiresVideo(false);
    setMandatory(false);
  };

  const removeStep = useMutation({
    mutationFn: (stepId: string) => api(`/steps/${stepId}`, { method: 'DELETE' }),
    onSuccess: onChanged,
    onError: (e) => Alert.alert('Lỗi', (e as Error).message),
  });

  const duplicateForFloor = useMutation({
    mutationFn: (p: { source: Step; floorLabel: string }) => {
      const dupName = p.source.floorLabel
        ? p.source.name.replaceAll(p.source.floorLabel, p.floorLabel)
        : `${p.source.name} — ${p.floorLabel}`;
      return api(`/phases/${phase.id}/steps`, {
        method: 'POST',
        body: {
          name: dupName,
          acceptance: p.source.acceptance,
          minPhotos: p.source.minPhotos,
          requiresVideo: p.source.requiresVideo,
          mandatory: p.source.mandatory,
          floorLabel: p.floorLabel,
        },
      });
    },
    onSuccess: () => {
      setFloorPromptStepId(null);
      setNewFloorLabel('');
      onChanged();
    },
    onError: (e) => Alert.alert('Lỗi', (e as Error).message),
  });

  const submitDuplicateForFloor = (source: Step) => {
    const label = newFloorLabel.trim();
    if (!label) return;
    if (canEdit) {
      duplicateForFloor.mutate({ source, floorLabel: label });
      return;
    }
    const dupName = source.floorLabel
      ? source.name.replaceAll(source.floorLabel, label)
      : `${source.name} — ${label}`;
    onPropose('ADD_STEP', {
      phaseId: phase.id,
      name: dupName,
      acceptance: source.acceptance,
      minPhotos: source.minPhotos,
      requiresVideo: source.requiresVideo,
      mandatory: source.mandatory,
      floorLabel: label,
    });
    setFloorPromptStepId(null);
    setNewFloorLabel('');
  };

  const removePhase = useMutation({
    mutationFn: () => api(`/phases/${phase.id}`, { method: 'DELETE' }),
    onSuccess: onChanged,
    onError: (e) => Alert.alert('Không xoá được', (e as Error).message),
  });

  const adjustDurationDirect = useMutation({
    mutationFn: (days: number) =>
      api(`/phases/${phase.id}/duration`, { method: 'PATCH', body: { plannedDurationDays: days } }),
    onSuccess: onChanged,
    onError: (e) => Alert.alert('Lỗi', (e as Error).message),
  });

  const dragGesture = Gesture.Pan()
    .onBegin(() => {
      draggingIndex.value = index;
      runOnJS(onDragStart)();
    })
    .onUpdate((e) => {
      dragY.value = e.translationY;
    })
    .onEnd((e) => {
      const translation = e.translationY;
      dragY.value = withSpring(0, { damping: 20, stiffness: 200 });
      draggingIndex.value = -1;
      runOnJS(onDragEndRow)(index, translation);
    });

  // shadowOpacity/shadowRadius/shadowOffset không có trên Android và Fabric's animated fast-path
  // báo lỗi "You are setting the style..." khi đưa chúng vào useAnimatedStyle — chỉ giữ lại
  // transform/zIndex/elevation (an toàn đa nền tảng), phần shadow cho iOS đưa vào style tĩnh bên
  // dưới thay vì animate.
  const animatedStyle = useAnimatedStyle(() => {
    const isDragging = draggingIndex.value === index;
    return {
      transform: [{ translateY: isDragging ? dragY.value : 0 }],
      zIndex: isDragging ? 100 : 0,
      elevation: isDragging ? 8 : 0,
    };
  });

  return (
    <Animated.View
      style={[styles.phaseCard, animatedStyle]}
      onLayout={(e) => onLayoutRow(index, e.nativeEvent.layout.y, e.nativeEvent.layout.height)}
    >
      <View style={styles.phaseHeaderRow}>
        {(canEdit || canPropose) && (
          <GestureDetector gesture={dragGesture}>
            <View style={styles.dragHandle} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Feather name="menu" size={17} color={colors.textMuted} />
            </View>
          </GestureDetector>
        )}
        <TouchableOpacity
          style={styles.phaseHeader}
          onPress={() => setExpanded((v) => !v)}
          activeOpacity={0.7}
        >
          <Text style={styles.phaseTitle}>
            {phase.code}. {phase.name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {canRemovePhase && (
              <TouchableOpacity
                style={styles.removePhaseBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={(e) => {
                  e.stopPropagation();
                  Alert.alert(
                    canEdit ? 'Xoá hạng mục này?' : 'Đề xuất xoá hạng mục này?',
                    `"${phase.name}" và toàn bộ ${phase.steps.length} bước bên trong sẽ ${
                      canEdit ? 'bị xoá khỏi kế hoạch' : 'bị đề xuất xoá, chờ chủ nhà duyệt'
                    }.`,
                    [
                      { text: 'Hủy', style: 'cancel' },
                      {
                        text: canEdit ? 'Xoá' : 'Đề xuất',
                        style: 'destructive',
                        onPress: () =>
                          canEdit ? removePhase.mutate() : onPropose('REMOVE_PHASE', { phaseId: phase.id }),
                      },
                    ],
                  );
                }}
              >
                <Feather name="trash-2" size={13} color={colors.danger} />
                <Text style={styles.removePhaseText}>{canEdit ? 'Xoá hạng mục' : 'Đề xuất xoá'}</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.chevron}>{expanded ? '▴' : '▾'}</Text>
          </View>
        </TouchableOpacity>
      </View>

      <DurationRow
        phase={phase}
        canEdit={canEdit}
        canPropose={canPropose}
        onSaveDirect={(days) => adjustDurationDirect.mutate(days)}
        onPropose={(days) => onPropose('ADJUST_DURATION', { phaseId: phase.id, plannedDurationDays: days })}
      />

      {expanded && (
        <View>
          {phase.steps.map((s) => {
            const canRemoveStep =
              (canEdit || canPropose) && (!s.mandatory || isOwner) && s.status === 'LOCKED';
            const canDuplicateFloor = (canEdit || canPropose) && !!s.floorLabel;
            return (
              <View key={s.id}>
              <View style={styles.stepRow}>
                <Link href={`/step/${s.id}`} asChild>
                  <TouchableOpacity style={{ flex: 1 }} activeOpacity={0.6}>
                    <Text style={styles.stepName}>
                      {s.order}. {s.name}
                      {s.mandatory && <Text style={{ color: colors.danger }}> * bắt buộc</Text>}
                    </Text>
                    <Text style={styles.stepMeta}>
                      Tối thiểu {s.minPhotos} ảnh{s.requiresVideo ? ' · Cần video' : ''}
                    </Text>
                  </TouchableOpacity>
                </Link>
                {canDuplicateFloor && (
                  <TouchableOpacity
                    style={styles.addFloorBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    onPress={() => {
                      setFloorPromptStepId(floorPromptStepId === s.id ? null : s.id);
                      setNewFloorLabel('');
                    }}
                  >
                    <Text style={styles.addFloorBtnText}>+ Tầng khác</Text>
                  </TouchableOpacity>
                )}
                {canRemoveStep && (
                  <TouchableOpacity
                    style={styles.removeStepBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    onPress={() =>
                      Alert.alert(
                        canEdit ? (s.mandatory ? 'Xóa bước bắt buộc?' : 'Xóa bước thương lượng?') : 'Đề xuất xoá bước này?',
                        s.name,
                        [
                        { text: 'Hủy', style: 'cancel' },
                        {
                          text: canEdit ? 'Xóa' : 'Đề xuất',
                          style: 'destructive',
                          onPress: () =>
                            canEdit ? removeStep.mutate(s.id) : onPropose('REMOVE_STEP', { stepId: s.id }),
                        },
                      ])
                    }
                  >
                    <Feather name="trash-2" size={13} color={colors.danger} />
                    <Text style={styles.removeStepText}>{canEdit ? 'Xóa' : 'Đề xuất xoá'}</Text>
                  </TouchableOpacity>
                )}
                {(canEdit || canPropose) && !canRemoveStep && (
                  <Text style={styles.mandatoryHint}>
                    {s.mandatory ? 'Bắt buộc, không xoá được' : 'Đã bắt đầu, không xoá được'}
                  </Text>
                )}
              </View>
              {floorPromptStepId === s.id && (
                <View style={styles.floorPromptRow}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    placeholder="Nhãn tầng mới (VD: Lầu 2)"
                    value={newFloorLabel}
                    onChangeText={setNewFloorLabel}
                    autoFocus
                  />
                  <TouchableOpacity
                    style={[
                      styles.addPhaseBtn,
                      (!newFloorLabel.trim() || duplicateForFloor.isPending) && { opacity: 0.5 },
                    ]}
                    disabled={!newFloorLabel.trim() || duplicateForFloor.isPending}
                    onPress={() => submitDuplicateForFloor(s)}
                  >
                    <Text style={styles.addPhaseBtnText}>{canEdit ? 'Thêm' : 'Đề xuất'}</Text>
                  </TouchableOpacity>
                </View>
              )}
              </View>
            );
          })}

          {(canEdit || canPropose) && (
            <View style={styles.addForm}>
              <Text style={styles.addFormLabel}>
                {canEdit ? 'Thêm bước thương lượng cho hạng mục này' : 'Đề xuất thêm bước cho hạng mục này'}
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Tên bước (VD: Ốp gạch trang trí bếp)"
                value={name}
                onChangeText={setName}
              />
              <TextInput
                style={styles.input}
                placeholder="Tiêu chí đạt (tùy chọn)"
                value={acceptance}
                onChangeText={setAcceptance}
              />
              <View style={styles.row}>
                <Text style={styles.smallLabel}>Số ảnh tối thiểu</Text>
                <TextInput
                  style={styles.numInput}
                  keyboardType="number-pad"
                  value={minPhotos}
                  onChangeText={setMinPhotos}
                />
              </View>
              <View style={styles.row}>
                <Text style={styles.smallLabel}>Bắt buộc quay video</Text>
                <Switch value={requiresVideo} onValueChange={setRequiresVideo} />
              </View>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.smallLabel}>Bước bắt buộc</Text>
                  <Text style={styles.smallHint}>
                    Không thể bỏ qua lúc thi công, và không xoá lại được sau khi thêm
                  </Text>
                </View>
                <Switch value={mandatory} onValueChange={setMandatory} />
              </View>
              <TouchableOpacity
                style={[styles.submitBtn, (!name.trim() || addStep.isPending) && { opacity: 0.5 }]}
                disabled={!name.trim() || addStep.isPending}
                onPress={submitAddStep}
              >
                <Text style={styles.submitText}>
                  {addStep.isPending ? 'Đang thêm…' : canEdit ? 'Thêm bước' : 'Đề xuất thêm bước'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </Animated.View>
  );
}

export default function PlanEditor() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const [customName, setCustomName] = useState('');
  const [scrollEnabled, setScrollEnabled] = useState(true);
  // Kéo-thả để đổi thứ tự: chủ nhà lúc PLANNING lưu ngay (như trước); thầu chính (hoặc chủ nhà lúc
  // ACTIVE) chỉ đổi cục bộ ở đây, phải bấm "Gửi đề xuất" mới thật sự tạo PlanChangeRequest.
  const [pendingOrder, setPendingOrder] = useState<Phase[] | null>(null);

  const draggingIndex = useSharedValue(-1);
  const dragY = useSharedValue(0);
  const itemPositions = useRef<{ top: number; height: number }[]>([]);

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/projects'),
  });
  const project = projects?.find((p) => p.id === projectId);
  const myRole = project?.members.find((m) => m.userId === user?.id)?.role;
  const isPlanning = project?.status === 'PLANNING';
  const isActive = project?.status === 'ACTIVE';
  // Chủ nhà sửa trực tiếp lúc lập kế hoạch (không đổi so với trước). Thầu chính giờ luôn phải đề
  // xuất; lúc thi công (ACTIVE) chủ nhà cũng phải đề xuất, thầu chính duyệt lại — đối xứng 2 chiều.
  const canEdit = myRole === 'OWNER' && isPlanning;
  const canPropose = myRole === 'MAIN_CONTRACTOR' || (myRole === 'OWNER' && isActive);
  const canApprove = myRole === 'OWNER' && isPlanning;

  const { data: phases, isLoading } = useQuery({
    queryKey: ['phases', projectId],
    queryFn: () => api<Phase[]>(`/projects/${projectId}/phases`),
    enabled: !!projectId,
  });
  const displayPhases = pendingOrder ?? phases;

  const { data: planOptions } = useQuery({
    queryKey: ['plan-options', projectId],
    queryFn: () => api<{ availablePhases: AvailablePhase[] }>(`/projects/${projectId}/plan-options`),
    enabled: !!projectId && (canEdit || canPropose),
  });

  const { data: planChanges } = useQuery({
    queryKey: ['plan-changes', projectId],
    queryFn: () => api<PlanChangeRequest[]>(`/projects/${projectId}/plan-changes`),
    enabled: !!projectId,
  });
  const pendingChanges = (planChanges ?? []).filter((r) => r.status === 'PROPOSED');

  const onChanged = () => {
    qc.invalidateQueries({ queryKey: ['phases', projectId] });
    qc.invalidateQueries({ queryKey: ['plan-options', projectId] });
    qc.invalidateQueries({ queryKey: ['plan-changes', projectId] });
  };

  const addStandardPhase = useMutation({
    mutationFn: (code: string) =>
      api(`/projects/${projectId}/phases`, { method: 'POST', body: { code } }),
    onSuccess: onChanged,
    onError: (e) => Alert.alert('Lỗi', (e as Error).message),
  });

  const addCustomPhase = useMutation({
    mutationFn: () =>
      api(`/projects/${projectId}/phases`, { method: 'POST', body: { name: customName.trim() } }),
    onSuccess: () => {
      setCustomName('');
      onChanged();
    },
    onError: (e) => Alert.alert('Lỗi', (e as Error).message),
  });

  const proposeChange = useMutation({
    mutationFn: (dto: { type: PlanChangeType; payload: Record<string, any>; note?: string }) =>
      api(`/projects/${projectId}/plan-changes`, { method: 'POST', body: dto }),
    onSuccess: () => {
      onChanged();
      Alert.alert('Đã gửi đề xuất', 'Chờ duyệt để áp dụng vào kế hoạch.');
    },
    onError: (e) => Alert.alert('Không gửi được đề xuất', (e as Error).message),
  });

  const onPropose = (type: PlanChangeType, payload: Record<string, any>) => {
    proposeChange.mutate({ type, payload });
  };

  const addStandardPhaseSubmit = (code: string) => {
    if (canEdit) addStandardPhase.mutate(code);
    else onPropose('ADD_PHASE', { code });
  };

  const addCustomPhaseSubmit = () => {
    if (canEdit) {
      addCustomPhase.mutate();
      return;
    }
    onPropose('ADD_PHASE', { name: customName.trim() });
    setCustomName('');
  };

  const decideChange = useMutation({
    mutationFn: (dto: { id: string; decision: 'APPROVED' | 'REJECTED'; note?: string }) =>
      api(`/plan-changes/${dto.id}/decide`, {
        method: 'POST',
        body: { decision: dto.decision, note: dto.note },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      onChanged();
    },
    onError: (e) => Alert.alert('Lỗi', (e as Error).message),
  });

  // Alert.prompt chỉ có trên iOS (undefined trên Android, khiến từ chối không kèm ghi chú lại tự
  // động submit ngay không hỏi gì) — dùng ô nhập inline theo từng đề xuất thay vì phụ thuộc API đó.
  const [rejectNotes, setRejectNotes] = useState<Record<string, string>>({});
  const rejectWithNote = (requestId: string) => {
    decideChange.mutate({ id: requestId, decision: 'REJECTED', note: rejectNotes[requestId]?.trim() });
  };

  // Sắp xếp lại (chủ nhà, lúc PLANNING): cập nhật cache ngay (mượt tay), gọi API lưu order thật —
  // thành công thì thay bằng dữ liệu server (có plannedStartDate/plannedEndDate tính lại đúng);
  // lỗi thì tải lại từ server để khôi phục đúng thứ tự.
  const reorderPhases = useMutation({
    mutationFn: (phaseIds: string[]) =>
      api<Phase[]>(`/projects/${projectId}/phases/reorder`, { method: 'POST', body: { phaseIds } }),
    onSuccess: (serverPhases) => {
      qc.setQueryData(['phases', projectId], serverPhases);
    },
    onError: (e) => {
      Alert.alert('Không lưu được thứ tự', (e as Error).message);
      onChanged();
    },
  });

  const commitOrder = (orderedPhases: Phase[]) => {
    qc.setQueryData(['phases', projectId], orderedPhases);
    reorderPhases.mutate(orderedPhases.map((p) => p.id));
  };

  const submitReorderProposal = () => {
    if (!pendingOrder) return;
    proposeChange.mutate(
      { type: 'REORDER_PHASES', payload: { phaseIds: pendingOrder.map((p) => p.id) } },
      { onSuccess: () => setPendingOrder(null) },
    );
  };

  const handleLayoutRow = (index: number, y: number, height: number) => {
    itemPositions.current[index] = { top: y, height };
  };

  const handleDragEndRow = (index: number, translationY: number) => {
    setScrollEnabled(true);
    const pos = itemPositions.current;
    if (!displayPhases || !pos[index]) return;
    const draggedCenter = pos[index].top + pos[index].height / 2 + translationY;
    let targetIndex = index;
    for (let i = 0; i < pos.length; i++) {
      const row = pos[i];
      if (!row) continue;
      if (draggedCenter >= row.top && draggedCenter < row.top + row.height) {
        targetIndex = i;
        break;
      }
    }
    if (targetIndex !== index) {
      const next = [...displayPhases];
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved);
      if (canEdit) commitOrder(next);
      else setPendingOrder(next);
    }
  };

  const importSchedule = useMutation({
    mutationFn: async () => {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets[0]) return false;
      const asset = result.assets[0];
      await uploadPlanImport(
        projectId!,
        asset.uri,
        asset.name,
        asset.mimeType ?? 'application/octet-stream',
      );
      return true;
    },
    onSuccess: (didUpload) => {
      if (!didUpload) return;
      onChanged();
      Alert.alert('Đã gửi đề xuất', 'AI đã phân tích file, chờ chủ nhà duyệt tiến độ mới.');
    },
    onError: (e) => Alert.alert('Không import được', (e as Error).message),
  });

  const approvePlan = useMutation({
    mutationFn: () => api(`/projects/${projectId}/plan/approve`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      onChanged();
      Alert.alert('Đã duyệt', 'Kế hoạch được duyệt, dự án bắt đầu thi công.');
    },
    onError: (e) => Alert.alert('Chưa duyệt được', (e as Error).message),
  });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      scrollEnabled={scrollEnabled}
    >
      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          Có sẵn 1 kế hoạch chuẩn theo quy trình XA, mỗi hạng mục có thời gian dự kiến mặc định.
          Lúc lập kế hoạch, chủ nhà sửa trực tiếp (thêm/bớt hạng mục, bước, đổi thời gian, sắp xếp
          lại thứ tự). Thầu chính muốn sửa phải đề xuất, chủ nhà duyệt/từ chối. Sau khi duyệt kế
          hoạch và bắt đầu thi công, mọi thay đổi (kể cả của chủ nhà) đều phải qua đề xuất và được
          bên còn lại duyệt.
        </Text>
      </View>

      {project && !isPlanning && !isActive && (
        <Text style={styles.empty}>
          Dự án đã ở trạng thái {project.status}, kế hoạch không còn chỉnh sửa được, chỉ xem lại.
        </Text>
      )}
      {project && isPlanning && !canEdit && !canPropose && (
        <Text style={styles.empty}>Bạn đang xem kế hoạch, không có quyền sửa hay đề xuất.</Text>
      )}
      {(canEdit || canPropose) && (phases?.length ?? 0) > 1 && (
        <Text style={styles.dragHint}>
          Chạm giữ biểu tượng danh sách bên trái mỗi hạng mục để kéo đổi vị trí
          {canEdit ? ', lưu ngay.' : ', sau đó gửi đề xuất để bên còn lại duyệt.'}
        </Text>
      )}
      {myRole === 'MAIN_CONTRACTOR' && isPlanning && (
        <TouchableOpacity
          style={[styles.importBtn, importSchedule.isPending && { opacity: 0.6 }]}
          disabled={importSchedule.isPending}
          onPress={() => importSchedule.mutate()}
        >
          <Feather name="upload" size={15} color={colors.primary} />
          <Text style={styles.importBtnText}>
            {importSchedule.isPending
              ? 'Đang phân tích file…'
              : 'Import tiến độ từ file (PDF/Excel)'}
          </Text>
        </TouchableOpacity>
      )}

      {myRole === 'OWNER' && (
        <Link href={`/project/${projectId}/members`} asChild>
          <TouchableOpacity style={styles.inviteBtn}>
            <Feather name="user-plus" size={15} color={colors.primary} />
            <Text style={styles.inviteBtnText}>Mời giám sát cho 1 vài bước cụ thể</Text>
          </TouchableOpacity>
        </Link>
      )}

      {pendingChanges.length > 0 && (
        <View style={styles.requestsBox}>
          <Text style={styles.addFormLabel}>Đề xuất thay đổi kế hoạch</Text>
          {pendingChanges.map((req) => {
            const canDecide = myRole === req.targetApproverRole;
            return (
              <View key={req.id} style={styles.requestRow}>
                <Text style={styles.requestDesc}>{describeRequest(req, phases)}</Text>
                <Text style={styles.requestMeta}>
                  Đề xuất bởi {req.requestedBy.name} · {formatTime(req.createdAt)}
                </Text>
                {req.type === 'IMPORT_SCHEDULE' && <ImportScheduleReviewPanel req={req} />}
                {canDecide ? (
                  <>
                    <TextInput
                      style={[styles.input, { marginTop: 8, marginBottom: 0 }]}
                      placeholder="Lý do từ chối (tùy chọn)"
                      value={rejectNotes[req.id] ?? ''}
                      onChangeText={(v) => setRejectNotes((prev) => ({ ...prev, [req.id]: v }))}
                    />
                    <View style={[styles.row, { marginTop: 8 }]}>
                      <TouchableOpacity
                        style={[styles.decideBtn, { backgroundColor: colors.success }]}
                        onPress={() => decideChange.mutate({ id: req.id, decision: 'APPROVED' })}
                      >
                        <Text style={styles.decideBtnText}>Duyệt</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.decideBtn, { backgroundColor: colors.danger }]}
                        onPress={() => rejectWithNote(req.id)}
                      >
                        <Text style={styles.decideBtnText}>Từ chối</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <Text style={styles.waitingText}>
                    Đang chờ {req.targetApproverRole === 'OWNER' ? 'chủ nhà' : 'thầu chính'} duyệt
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      )}

      {pendingOrder && (
        <View style={styles.requestsBox}>
          <Text style={styles.requestDesc}>Đã đổi thứ tự cục bộ, chưa lưu.</Text>
          <Text style={styles.requestMeta}>
            Gửi đề xuất để {myRole === 'OWNER' ? 'thầu chính' : 'chủ nhà'} duyệt thứ tự mới này.
          </Text>
          <View style={[styles.row, { marginTop: 8 }]}>
            <TouchableOpacity
              style={[styles.decideBtn, { backgroundColor: colors.textMuted }]}
              onPress={() => setPendingOrder(null)}
            >
              <Text style={styles.decideBtnText}>Huỷ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.decideBtn, { backgroundColor: colors.primary }]}
              disabled={proposeChange.isPending}
              onPress={submitReorderProposal}
            >
              <Text style={styles.decideBtnText}>
                {proposeChange.isPending ? 'Đang gửi…' : 'Gửi đề xuất sắp xếp'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {isLoading && <Text style={styles.empty}>Đang tải…</Text>}
      {(displayPhases ?? []).map((phase, index) => (
        <PhasePlanCard
          key={phase.id}
          phase={phase}
          index={index}
          canEdit={!!canEdit}
          canPropose={!!canPropose}
          isOwner={myRole === 'OWNER'}
          onChanged={onChanged}
          onPropose={onPropose}
          draggingIndex={draggingIndex}
          dragY={dragY}
          onLayoutRow={handleLayoutRow}
          onDragEndRow={handleDragEndRow}
          onDragStart={() => setScrollEnabled(false)}
        />
      ))}

      {(canEdit || canPropose) && !!planOptions?.availablePhases.length && (
        <View style={styles.availableBox}>
          <Text style={styles.addFormLabel}>
            {canEdit ? 'Thêm lại hạng mục chuẩn' : 'Đề xuất thêm lại hạng mục chuẩn'}
          </Text>
          {planOptions.availablePhases.map((p) => (
            <View key={p.code} style={styles.availableRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepName}>
                  {p.code}. {p.name}
                </Text>
                <Text style={styles.stepMeta}>{p.stepCount} bước chuẩn</Text>
              </View>
              <TouchableOpacity
                style={styles.addPhaseBtn}
                disabled={addStandardPhase.isPending || proposeChange.isPending}
                onPress={() => addStandardPhaseSubmit(p.code)}
              >
                <Text style={styles.addPhaseBtnText}>{canEdit ? 'Thêm' : 'Đề xuất'}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {(canEdit || canPropose) && (
        <View style={styles.availableBox}>
          <Text style={styles.addFormLabel}>
            {canEdit ? 'Tạo hạng mục tuỳ chỉnh' : 'Đề xuất hạng mục tuỳ chỉnh'}
          </Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              placeholder="VD: Sân vườn, hồ bơi mini…"
              value={customName}
              onChangeText={setCustomName}
            />
            <TouchableOpacity
              style={[
                styles.addPhaseBtn,
                (!customName.trim() || addCustomPhase.isPending || proposeChange.isPending) && {
                  opacity: 0.5,
                },
              ]}
              disabled={!customName.trim() || addCustomPhase.isPending || proposeChange.isPending}
              onPress={addCustomPhaseSubmit}
            >
              <Text style={styles.addPhaseBtnText}>{canEdit ? 'Tạo' : 'Đề xuất'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {canApprove && (
        <TouchableOpacity
          style={[styles.approveBtn, approvePlan.isPending && { opacity: 0.6 }]}
          disabled={approvePlan.isPending}
          onPress={() =>
            Alert.alert(
              'Duyệt kế hoạch?',
              'Sau khi duyệt, mọi thay đổi kế hoạch (kể cả của chủ nhà) đều phải qua đề xuất và được bên còn lại duyệt.',
              [
                { text: 'Xem lại', style: 'cancel' },
                { text: 'Duyệt', onPress: () => approvePlan.mutate() },
              ],
            )
          }
        >
          <Text style={styles.approveBtnText}>
            {approvePlan.isPending ? 'Đang duyệt…' : 'Duyệt kế hoạch, bắt đầu thi công'}
          </Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  notice: { backgroundColor: colors.primaryLight, borderRadius: 12, padding: 12, marginBottom: 16 },
  noticeText: { color: colors.primary, fontSize: 12, lineHeight: 18 },
  dragHint: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginBottom: 12 },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  importBtnText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  inviteBtnText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  importPanel: {
    backgroundColor: colors.bg,
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
  },
  importSummary: { color: colors.text, fontSize: 12, fontWeight: '700' },
  importNarrative: { color: colors.textMuted, fontSize: 12, marginTop: 4, lineHeight: 17 },
  importDiffRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 6 },
  importDiffText: { flex: 1, color: colors.text, fontSize: 11.5, lineHeight: 16 },
  importPhaseLine: { color: colors.textMuted, fontSize: 11.5, lineHeight: 17 },
  requestsBox: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  requestRow: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 8,
  },
  requestDesc: { color: colors.text, fontSize: 13, fontWeight: '600' },
  requestMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  waitingText: { color: colors.warning, fontSize: 12, fontWeight: '600', marginTop: 6 },
  decideBtn: { flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  decideBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  phaseCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  phaseHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dragHandle: { paddingVertical: 4, paddingRight: 2 },
  phaseHeader: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  phaseTitle: { fontSize: 14, fontWeight: '700', color: colors.text, flexShrink: 1 },
  removePhaseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  removePhaseText: { color: colors.danger, fontWeight: '700', fontSize: 12 },
  chevron: { fontSize: 14, color: colors.textMuted, fontWeight: '700' },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  durationText: { color: colors.textMuted, fontSize: 12, flex: 1 },
  durationInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    width: 50,
    textAlign: 'center',
    fontSize: 12, color: colors.text,
  },
  durationUnit: { color: colors.textMuted, fontSize: 12, flex: 1 },
  durationSaveBtn: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  durationSaveText: { color: '#fff', fontWeight: '700', fontSize: 11 },
  proposeLink: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 8,
    gap: 8,
  },
  removeStepBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  removeStepText: { color: colors.danger, fontWeight: '700', fontSize: 12 },
  addFloorBtn: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  addFloorBtnText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  floorPromptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
    paddingHorizontal: 2,
  },
  mandatoryHint: { color: colors.textMuted, fontSize: 11, fontStyle: 'italic' },
  stepName: { color: colors.text, fontSize: 13, fontWeight: '600' },
  stepMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  addForm: { marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  addFormLabel: { fontWeight: '700', color: colors.primary, fontSize: 12, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    fontSize: 13, color: colors.text,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 },
  smallLabel: { color: colors.text, fontSize: 12, fontWeight: '600' },
  smallHint: { color: colors.textMuted, fontSize: 11, marginTop: 2, lineHeight: 15 },
  numInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 8,
    width: 60,
    textAlign: 'center',
    fontSize: 13, color: colors.text,
  },
  submitBtn: { backgroundColor: colors.primary, borderRadius: 10, padding: 10, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  empty: { textAlign: 'center', color: colors.textMuted, marginBottom: 16, lineHeight: 20 },
  availableBox: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  availableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 8,
    gap: 8,
  },
  addPhaseBtn: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  addPhaseBtnText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  approveBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  approveBtnText: { color: '#fff', fontWeight: '700' },
});
