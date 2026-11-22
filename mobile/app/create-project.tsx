import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRouter } from 'expo-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { api } from '@/api/client';
import { DateField } from '@/components/DateField';
import { Feather } from '@/components/Feather';
import { InviteMembers, useInvitedSummary } from '@/members/InviteMembers';
import { connectDriveFlow, listDriveAccounts, showDriveUploadError } from '@/googleDrive';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { ContractType, Project, TemplatePhase } from '@/types';

/**
 * Wizard tạo dự án theo mockup 04 → 08: Thông tin dự án → Chọn bước thi công → Tùy chỉnh hạng
 * mục → Mời thành viên → Xác nhận. Dự án được tạo ở bước "Mời thành viên" (cần projectId để gửi
 * lời mời), nút "Bắt đầu dự án" ở bước cuối chỉ mở dự án.
 */

const BUILDING_TYPES = ['Nhà phố', 'Biệt thự', 'Nhà cấp 4', 'Khác'];

/// Mẫu chọn sẵn theo loại nhà (review 10.6 #11) — các bước thường KHÔNG áp dụng, bỏ chọn sẵn; người
/// dùng vẫn tick lại được ở bước Chọn bước thi công.
const SKIP_BY_BUILDING: Record<string, string[]> = {
  'Nhà phố': ['B-29'], // ít đất làm cảnh quan
  'Biệt thự': [],
  'Nhà cấp 4': ['B-04', 'B-08', 'B-29'], // 1 tầng: thường không ép cọc, không cầu thang
  Khác: [],
};

// Loại hợp đồng quyết định ai thấy giá vật tư và các bước áp dụng (review 10.6 #4). Cải tạo/Chung cư
// tự bỏ phần kết cấu thô (backend contract-scope.util).
const CONTRACTS: { value: ContractType; label: string; hint: string }[] = [
  { value: 'TRON_GOI_A_Z', label: 'Trọn gói', hint: 'Thầu lo cả vật tư và nhân công' },
  { value: 'THO_VA_NHAN_CONG_HOAN_THIEN', label: 'Thô + nhân công hoàn thiện', hint: 'Thầu lo phần thô, chủ nhà mua vật tư hoàn thiện' },
  { value: 'NHAN_CONG', label: 'Khoán nhân công', hint: 'Chủ nhà tự mua vật tư — chủ nhà thấy giá vật tư' },
  { value: 'CAI_TAO', label: 'Nhà cải tạo', hint: 'Sửa/hoàn thiện lại nhà có sẵn — có tháo dỡ, bỏ phần móng/kết cấu' },
  { value: 'CHUNG_CU', label: 'Căn hộ chung cư', hint: 'Chỉ hoàn thiện nội thất, kết cấu toà nhà có sẵn' },
];
const STEPS = ['info', 'steps', 'custom', 'invite', 'confirm'] as const;
type Step = (typeof STEPS)[number];
const TITLES: Record<Step, string> = {
  info: 'Tạo dự án',
  steps: 'Chọn bước thi công',
  custom: 'Tùy chỉnh hạng mục',
  invite: 'Mời thành viên',
  confirm: 'Xác nhận dự án',
};

const STAGES = [
  { max: 4, label: 'Giai đoạn 0: Chuẩn bị & Mặt bằng' },
  { max: 12, label: 'Giai đoạn 1: Phần thô (B-05 → B-12)' },
  { max: 29, label: 'Giai đoạn 2: Hoàn thiện (B-13 → B-29)' },
  { max: Infinity, label: 'Giai đoạn 3: Bàn giao (B-30 → B-31)' },
];
const stageOf = (order: number) => STAGES.find((s) => order <= s.max)!.label;

function addMonthsVn(iso: string, months: number) {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function CreateProject() {
  const router = useRouter();
  const navigation = useNavigation();
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>('info');
  const user = useAuth((s) => s.user);
  const { data: myProjects } = useQuery({ queryKey: ['projects'], queryFn: () => api<Project[]>('/projects') });
  // Vai trò lúc đăng ký; tài khoản cũ thì suy ra: đang là thầu chính ở dự án nào đó → Nhà thầu.
  const creatorRole =
    user?.signupRole ??
    ((myProjects ?? []).some((p) => p.members.some((m) => m.userId === user?.id && m.role === 'MAIN_CONTRACTOR'))
      ? 'MAIN_CONTRACTOR'
      : 'OWNER');

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [floors, setFloors] = useState('');
  const [buildingType, setBuildingType] = useState('Nhà phố');
  const [contract, setContract] = useState<ContractType>('THO_VA_NHAN_CONG_HOAN_THIEN');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  const [excluded, setExcluded] = useState<string[]>([]);
  const [extraSteps, setExtraSteps] = useState<{ phaseCode: string; name: string }[]>([]);
  const [customPhases, setCustomPhases] = useState<{ name: string; steps: string[] }[]>([]);
  const [editingPhase, setEditingPhase] = useState<string | null>(null);
  const [newStepName, setNewStepName] = useState('');
  const [addonName, setAddonName] = useState('');
  const [addonSteps, setAddonSteps] = useState('');
  const [showAddon, setShowAddon] = useState(false);

  const [project, setProject] = useState<Project | null>(null);

  const [driveAccountId, setDriveAccountId] = useState<string | null>(null);
  const [connectingDrive, setConnectingDrive] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: TITLES[step] });
  }, [navigation, step]);

  const { data: templatePhases } = useQuery({
    queryKey: ['template-phases', contract],
    queryFn: () => api<TemplatePhase[]>(`/templates/default/phases?contractType=${contract}`),
  });
  const { data: driveAccounts, refetch: refetchDrive } = useQuery({
    queryKey: ['drive-accounts'],
    queryFn: listDriveAccounts,
  });
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ telegramChatId: string | null }>('/me'),
  });

  // Chỉ giữ ID còn trong danh sách — ID cũ (sau khi kết nối lại Drive) bị backend từ chối.
  useEffect(() => {
    if (!driveAccounts) return;
    if (!driveAccounts.some((a) => a.id === driveAccountId)) setDriveAccountId(driveAccounts[0]?.id ?? null);
  }, [driveAccounts, driveAccountId]);

  // Đổi hợp đồng/loại nhà thì chọn lại theo mẫu (chỉ bỏ những mã có trong danh sách hiện tại).
  // Mẫu áp 1 lần mỗi khi đổi loại nhà/hợp đồng; refetch danh sách bước không ghi đè chỉnh tay.
  const appliedTemplate = useRef('');
  useEffect(() => {
    if (!templatePhases) return;
    const key = `${contract}|${buildingType}`;
    if (appliedTemplate.current === key) return;
    appliedTemplate.current = key;
    const codes = new Set(templatePhases.map((p) => p.code));
    setExcluded((SKIP_BY_BUILDING[buildingType] ?? []).filter((c) => codes.has(c)));
  }, [contract, buildingType, templatePhases]);

  const phases = (templatePhases ?? []).slice().sort((a, b) => a.order - b.order);
  const selected = phases.filter((p) => !excluded.includes(p.code));

  const createProject = useMutation({
    mutationFn: () =>
      api<Project>('/projects', {
        method: 'POST',
        body: {
          name: name.trim(),
          address: address.trim(),
          floors: floors.trim(),
          buildingType,
          expectedStartDate: startDate?.toISOString(),
          expectedEndDate: endDate?.toISOString(),
          driveAccountId,
          creatorRole,
          contractType: contract,
          excludePhaseCodes: excluded,
          extraSteps,
          customPhases: customPhases.map((p) => ({ name: p.name, steps: p.steps.map((s) => ({ name: s })) })),
        },
      }),
    onSuccess: (p) => {
      setProject(p);
      qc.invalidateQueries({ queryKey: ['projects'] });
      setStep('invite');
    },
    // Tài khoản Drive chọn để tạo dự án là của chính người tạo — luôn kết nối lại được.
    onError: (e) => showDriveUploadError((e as Error).message, true, () => refetchDrive()),
  });

  const connectDrive = async () => {
    setConnectingDrive(true);
    try {
      await connectDriveFlow();
      const res = await refetchDrive();
      const latest = res.data?.[res.data.length - 1];
      if (latest) setDriveAccountId(latest.id);
    } catch (e) {
      Alert.alert('Kết nối Google Drive thất bại', (e as Error).message);
    } finally {
      setConnectingDrive(false);
    }
  };

  const next = () => {
    if (step === 'info') {
      if (!name.trim() || !address.trim() || !floors.trim()) {
        Alert.alert('Thiếu thông tin', 'Cần nhập Tên dự án, Địa chỉ và Số tầng.');
        return;
      }
      if (startDate && endDate && endDate < startDate) {
        Alert.alert('Ngày không hợp lệ', 'Ngày hoàn thành phải sau ngày bắt đầu.');
        return;
      }
      if (!driveAccountId) {
        Alert.alert('Cần Google Drive', 'Kết nối Google Drive để lưu ảnh, video, báo cáo của dự án.');
        return;
      }
      setStep('steps');
    } else if (step === 'steps') setStep('custom');
    else if (step === 'custom') {
      if (project) setStep('invite');
      else createProject.mutate();
    } else if (step === 'invite') setStep('confirm');
  };

  const back = () => {
    const i = STEPS.indexOf(step);
    // Dự án đã tạo thì không quay lại sửa bước chọn/tuỳ chỉnh được nữa.
    if (i === 0 || (project && step === 'invite')) router.back();
    else setStep(STEPS[i - 1]);
  };

  const togglePhase = (code: string) =>
    setExcluded((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));

  const saveAddon = () => {
    const steps = addonSteps
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!addonName.trim() || steps.length === 0) {
      Alert.alert('Thiếu thông tin', 'Cần tên hạng mục và ít nhất 1 bước nhỏ (mỗi dòng 1 bước).');
      return;
    }
    setCustomPhases((prev) => [...prev, { name: addonName.trim(), steps }]);
    setAddonName('');
    setAddonSteps('');
    setShowAddon(false);
  };

  const invitedSummary = useInvitedSummary(project?.id);

  // Dùng thử 2 tháng tính từ ngày tạo dự án (Dashboard đếm ngược cùng mốc này).
  const trialStart = project?.createdAt ?? new Date().toISOString();

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 'info' && (
          <>
            <Text style={styles.heading}>Thông tin dự án</Text>
            <Label text="Tên dự án" required />
            <TextInput style={styles.input} placeholder="Nhà anh Minh" value={name} onChangeText={setName} />
            <Label text="Địa chỉ" required />
            <TextInput
              style={styles.input}
              placeholder="234 Nguyễn Trãi, Q.1, TP.HCM"
              value={address}
              onChangeText={setAddress}
            />
            <Label text="Số tầng" required />
            <TextInput
              style={styles.input}
              placeholder="3 tầng + 1 sân thượng"
              value={floors}
              onChangeText={setFloors}
            />
            <Label text="Loại công trình" />
            <View style={styles.chipRow}>
              {BUILDING_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, buildingType === t && styles.chipActive]}
                  onPress={() => setBuildingType(t)}
                >
                  <Text style={[styles.chipText, buildingType === t && styles.chipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Label text="Hình thức hợp đồng" />
            <View style={{ gap: 8, marginBottom: 14 }}>
              {CONTRACTS.map((c) => (
                <TouchableOpacity
                  key={c.value}
                  style={[styles.contractCard, contract === c.value && styles.contractCardOn]}
                  onPress={() => setContract(c.value)}
                >
                  <Text style={[styles.phaseName, contract === c.value && { color: colors.primary }]}>{c.label}</Text>
                  <Text style={styles.phaseSub}>{c.hint}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Label text="Ngày dự kiến bắt đầu" />
            <DateField value={startDate} onChange={setStartDate} placeholder="Chọn ngày bắt đầu" />
            <Label text="Ngày dự kiến hoàn thành" />
            <DateField value={endDate} onChange={setEndDate} placeholder="Chọn ngày hoàn thành" minimumDate={startDate ?? undefined} />

            {!driveAccountId && (
              <Text style={styles.hintBox}>Ảnh, video của dự án lưu vào Google Drive của tài khoản bạn kết nối (miễn phí 15GB).</Text>
            )}
            {!driveAccountId && (
              <TouchableOpacity style={styles.driveBtn} disabled={connectingDrive} onPress={connectDrive}>
                {connectingDrive ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.driveBtnText}>📁 Kết nối Google Drive</Text>
                )}
              </TouchableOpacity>
            )}

            <PrimaryButton label="Tiếp tục →" onPress={next} />
            <View style={styles.warnBox}>
              <Text style={styles.warnText}>⚠️ Chủ nhà: tối đa 1 dự án. Nhà thầu: theo gói đã mua.</Text>
            </View>
          </>
        )}

        {step === 'steps' && (
          <>
            <View style={styles.selRow}>
              <Text style={styles.selCount}>
                Đã chọn {selected.length}/{phases.length} bước
              </Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity onPress={() => setExcluded([])}>
                  <Text style={styles.linkText}>Chọn tất cả</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setExcluded(phases.map((p) => p.code))}>
                  <Text style={[styles.linkText, { color: colors.textMuted }]}>Bỏ tất cả</Text>
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.hintBox}>
              Đã chọn sẵn các bước theo loại nhà ({buildingType}) và hình thức hợp đồng. Không chắc thì cứ để nguyên — có thể thêm/bớt sau ở Kế hoạch thi công.
            </Text>
            {!templatePhases && <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />}
            {phases.map((p, i) => {
              const checked = !excluded.includes(p.code);
              const newStage = i === 0 || stageOf(phases[i - 1].order) !== stageOf(p.order);
              return (
                <View key={p.code}>
                  {newStage && <Text style={styles.stage}>{stageOf(p.order)}</Text>}
                  <TouchableOpacity style={styles.phaseRow} onPress={() => togglePhase(p.code)}>
                    <View style={[styles.checkbox, checked && styles.checkboxOn]}>
                      {checked && <Feather name="check" size={12} color="#fff" />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.phaseName}>
                        {p.code}: {p.name}
                      </Text>
                      <Text style={styles.phaseSub}>{p.stepCount} bước nhỏ</Text>
                    </View>
                    {p.repeatsPerFloor ? (
                      <Text style={[styles.badge, styles.badgeBlue]}>Lặp/tầng</Text>
                    ) : (
                      <Text style={[styles.badge, checked ? styles.badgeGreen : styles.badgeGray]}>
                        {checked ? 'Chuẩn' : 'Chọn'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
            <PrimaryButton label="Tiếp tục →" onPress={next} />
          </>
        )}

        {step === 'custom' && (
          <>
            <Text style={styles.heading}>Thêm bước nhỏ & hạng mục mới</Text>
            {selected.map((p) => {
              const extras = extraSteps.filter((x) => x.phaseCode === p.code);
              const open = editingPhase === p.code;
              return (
                <View key={p.code} style={styles.card}>
                  <TouchableOpacity
                    style={styles.cardHeader}
                    onPress={() => setEditingPhase(open ? null : p.code)}
                  >
                    <Text style={styles.cardTitle}>
                      {p.code}: {p.name} — Bước nhỏ
                    </Text>
                    <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                  {open && (
                    <>
                      {p.stepNames.map((s, i) => (
                        <View key={i} style={styles.subStep}>
                          <Text style={styles.subStepName}>● {s}</Text>
                          <Text style={styles.subStepHint}>
                            {i === 0 ? 'Bước chuẩn — không xoá được' : 'Bước chuẩn'}
                          </Text>
                        </View>
                      ))}
                      {extras.map((x, i) => (
                        <View key={`x${i}`} style={[styles.subStep, styles.subStepCustom]}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.subStepName}>+ {x.name}</Text>
                            <Text style={styles.subStepHint}>Bước tuỳ chỉnh — có thể xoá 🗑️</Text>
                          </View>
                          <Text style={[styles.badge, styles.badgeAmber]}>Tuỳ chỉnh</Text>
                          <TouchableOpacity
                            onPress={() => setExtraSteps((prev) => prev.filter((y) => y !== x))}
                            hitSlop={8}
                          >
                            <Feather name="trash-2" size={15} color={colors.danger} />
                          </TouchableOpacity>
                        </View>
                      ))}
                      <View style={styles.addStepRow}>
                        <TextInput
                          style={[styles.input, { flex: 1, marginBottom: 0 }]}
                          placeholder="Tên bước nhỏ tuỳ chỉnh"
                          value={newStepName}
                          onChangeText={setNewStepName}
                        />
                        <TouchableOpacity
                          disabled={!newStepName.trim()}
                          onPress={() => {
                            setExtraSteps((prev) => [...prev, { phaseCode: p.code, name: newStepName.trim() }]);
                            setNewStepName('');
                          }}
                        >
                          <Text style={[styles.linkText, !newStepName.trim() && { opacity: 0.4 }]}>Thêm</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                  {!open && (
                    <TouchableOpacity onPress={() => setEditingPhase(p.code)}>
                      <Text style={styles.dashedLink}>+ Thêm bước nhỏ tuỳ chỉnh</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}

            <Text style={styles.sectionTitle}>Hạng mục Add-on</Text>
            {customPhases.map((p, i) => (
              <View key={i} style={[styles.card, styles.addonCard]}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{p.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={[styles.badge, styles.badgeGreen]}>Add-on</Text>
                    <TouchableOpacity onPress={() => setCustomPhases((prev) => prev.filter((_, j) => j !== i))}>
                      <Feather name="trash-2" size={15} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={styles.phaseSub}>{p.steps.length} bước nhỏ tuỳ chỉnh</Text>
              </View>
            ))}
            {showAddon ? (
              <View style={styles.card}>
                <TextInput
                  style={styles.input}
                  placeholder="Tên hạng mục (VD: Hồ bơi mini)"
                  value={addonName}
                  onChangeText={setAddonName}
                />
                <TextInput
                  style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
                  placeholder={'Các bước nhỏ, mỗi dòng 1 bước'}
                  multiline
                  value={addonSteps}
                  onChangeText={setAddonSteps}
                />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={() => setShowAddon(false)}>
                    <Text style={styles.secondaryBtnText}>Huỷ</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.primaryBtn, { flex: 2, marginTop: 0 }]} onPress={saveAddon}>
                    <Text style={styles.primaryBtnText}>Lưu hạng mục</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.dashedBtn} onPress={() => setShowAddon(true)}>
                <Text style={styles.dashedBtnText}>+ Thêm hạng mục Add-on mới</Text>
              </TouchableOpacity>
            )}
            <PrimaryButton label="Tiếp tục →" onPress={next} loading={createProject.isPending} />
          </>
        )}

        {step === 'invite' && project && (
          <>
            <InviteMembers projectId={project.id} myRole={creatorRole} />
            <TouchableOpacity style={[styles.secondaryBtn, { marginTop: 16, flex: 0 }]} onPress={next}>
              <Text style={styles.secondaryBtnText}>Tiếp tục →</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'confirm' && (
          <>
            <View style={styles.readyIcon}>
              <Feather name="check" size={30} color="#fff" />
            </View>
            <Text style={[styles.heading, { textAlign: 'center', fontSize: 20 }]}>Sẵn sàng bắt đầu!</Text>
            <Text style={styles.subCenter}>Kiểm tra thông tin trước khi khởi động</Text>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Tóm tắt dự án</Text>
              <Row k="Dự án" v={name} />
              <Row k="Địa chỉ" v={address} />
              <Row k="Số tầng" v={floors} />
              <Row k="Bước đã chọn" v={`${selected.length}/${phases.length} bước`} />
              <Row k="Thành viên" v={invitedSummary} />
              <Row k="Google Drive" v={driveAccountId ? 'Đã kết nối ✓' : 'Chưa kết nối'} />
              <Row k="Telegram" v={me?.telegramChatId ? 'Đã kết nối ✓' : 'Chưa kết nối'} />
            </View>
            <View style={styles.trialBox}>
              <Text style={styles.trialTitle}>🎁 2 tháng dùng thử miễn phí</Text>
              <Text style={styles.trialSub}>
                Từ {addMonthsVn(trialStart, 0)} đến {addMonthsVn(trialStart, 2)}
              </Text>
            </View>
            <PrimaryButton label="Bắt đầu dự án" onPress={() => router.replace(`/project/${project!.id}`)} />
            <TouchableOpacity style={[styles.secondaryBtn, { marginTop: 10, flex: 0 }]} onPress={back}>
              <Text style={styles.secondaryBtnText}>Chỉnh sửa thiết lập</Text>
            </TouchableOpacity>
          </>
        )}

        {step !== 'confirm' && (
          <TouchableOpacity onPress={back}>
            <Text style={styles.backText}>{step === 'info' ? 'Huỷ' : '← Quay lại'}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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

function Row({ k, v }: { k: string; v: string }) {
  return (
    <Text style={styles.summaryRow}>
      <Text style={{ fontWeight: '700' }}>{k}:</Text> {v}
    </Text>
  );
}

function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.primaryBtn, (loading || disabled) && { opacity: 0.6 }]}
      disabled={loading || disabled}
      onPress={onPress}
    >
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{label}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingBottom: 40 },
  heading: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  input: {
    borderWidth: 1.5,
    borderColor: '#E5E5E5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    marginBottom: 14,
    backgroundColor: '#fff',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: { borderWidth: 1.5, borderColor: '#E5E5E5', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  chipText: { fontSize: 13, color: colors.text, fontWeight: '600' },
  chipTextActive: { color: colors.primary },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
    minHeight: 50,
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#E5E5E5',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  secondaryBtnText: { color: colors.text, fontWeight: '700' },
  warnBox: { backgroundColor: '#FFFBEB', borderRadius: 10, padding: 12, marginTop: 14 },
  warnText: { fontSize: 12, color: '#92400E' },
  driveBtn: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginBottom: 6,
  },
  driveBtnText: { color: colors.primary, fontWeight: '700' },
  selRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  selCount: { fontSize: 14, fontWeight: '800', color: colors.primary },
  linkText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  stage: { fontSize: 12, fontWeight: '800', color: colors.textMuted, marginTop: 16, marginBottom: 6 },
  hintBox: { fontSize: 12, color: colors.textMuted, backgroundColor: '#F9FAFB', borderRadius: 10, padding: 10, marginBottom: 6 },
  contractCard: { borderWidth: 1.5, borderColor: '#E5E5E5', borderRadius: 10, padding: 12 },
  contractCardOn: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  phaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: '#22C55E' },
  phaseName: { fontSize: 13, fontWeight: '700', color: colors.text },
  phaseSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  badge: {
    fontSize: 10,
    fontWeight: '700',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  badgeGreen: { color: colors.primary, backgroundColor: colors.primaryLight },
  badgeBlue: { color: '#1D4ED8', backgroundColor: '#EFF6FF' },
  badgeAmber: { color: '#B45309', backgroundColor: '#FFFBEB' },
  badgeGray: { color: colors.textMuted, backgroundColor: '#F3F4F6' },
  card: { borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 10, padding: 12, marginBottom: 10 },
  addonCard: { borderStyle: 'dashed', borderColor: colors.primary, backgroundColor: colors.primaryLight },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 13, fontWeight: '800', color: colors.text, flex: 1 },
  subStep: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  subStepCustom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  subStepName: { fontSize: 13, color: colors.text, fontWeight: '600' },
  subStepHint: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  addStepRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  dashedLink: { fontSize: 12, color: colors.primary, fontWeight: '700', marginTop: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: colors.text, marginTop: 14, marginBottom: 8 },
  dashedBtn: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginBottom: 6,
  },
  dashedBtnText: { color: colors.primary, fontWeight: '700' },
  readyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  subCenter: { textAlign: 'center', color: colors.textMuted, fontSize: 13, marginTop: -8, marginBottom: 16 },
  summaryRow: { fontSize: 13, color: colors.text, marginTop: 8 },
  trialBox: { backgroundColor: colors.primaryLight, borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 6 },
  trialTitle: { fontSize: 14, fontWeight: '800', color: colors.primary },
  trialSub: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  backText: { textAlign: 'center', color: colors.textMuted, marginTop: 16, fontSize: 13 },
});
