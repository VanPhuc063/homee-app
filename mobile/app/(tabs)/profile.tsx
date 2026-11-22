import { Feather } from '@/components/Feather';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
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
import { api } from '@/api/client';
import { connectDriveFlow, disconnectDriveAccount, listDriveAccounts } from '@/googleDrive';
import { useAuth } from '@/store/auth';
import { colors, projectStatusMeta, roleLabel } from '@/theme';
import type { GoogleDriveAccount, Project, ProjectInvite, ProjectRole } from '@/types';

interface MeFull {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  availableForHire: boolean;
  offeredRoles: ProjectRole[];
  bio: string | null;
  serviceArea: string | null;
  // Chỉ true sau khi đã hoàn tất ≥1 dự án với vai trò khác chủ nhà — xem MeController (backend).
  eligibleForProfessionalProfile: boolean;
  telegramChatId: string | null;
}

const OFFERED_ROLE_OPTIONS: ProjectRole[] = ['MAIN_CONTRACTOR', 'SUB_CONTRACTOR', 'SUPERVISOR'];
// Chỉ hiện tối đa 3 công trình ở Hồ sơ — xem đầy đủ thì qua tab Công trình, tránh Hồ sơ dài lê thê
// khi user tham gia nhiều dự án.
const PROJECTS_PREVIEW_COUNT = 3;

export default function Profile() {
  const { user, logout, updateUser } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [connecting, setConnecting] = useState(false);
  const [reconnectingId, setReconnectingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(user?.name ?? '');

  const saveName = useMutation({
    mutationFn: (name: string) =>
      api<{ id: string; name: string; phone: string }>('/me/profile', {
        method: 'PATCH',
        body: { name },
      }),
    onSuccess: async (res) => {
      await updateUser({ name: res.name });
      qc.invalidateQueries({ queryKey: ['projects'] });
      setEditingName(false);
    },
    onError: (e) => Alert.alert('Không đổi được tên', (e as Error).message),
  });

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/projects'),
  });

  const { data: driveAccounts, refetch: refetchDriveAccounts } = useQuery({
    queryKey: ['drive-accounts'],
    queryFn: listDriveAccounts,
  });

  const handleConnectDrive = async () => {
    setConnecting(true);
    try {
      await connectDriveFlow();
      await refetchDriveAccounts();
    } catch (e) {
      Alert.alert('Kết nối Google Drive thất bại', (e as Error).message);
    } finally {
      setConnecting(false);
    }
  };

  // Account hỏng (refresh token hết hạn/bị thu hồi) KHÔNG ngắt kết nối được nếu đang gắn với 1 công
  // trình (xem GoogleDriveService.disconnectAccount) — đây là cách duy nhất tự sửa: kết nối lại
  // CHÍNH account đó (login_hint gợi ý sẵn email, upsert theo googleUserId sẽ tự thay refresh token
  // cũ), không cần ngắt trước.
  const handleReconnectDrive = async (acc: GoogleDriveAccount) => {
    setReconnectingId(acc.id);
    try {
      await connectDriveFlow(acc.email);
      await refetchDriveAccounts();
      Alert.alert('Đã kết nối lại', `${acc.email} đã được làm mới quyền truy cập.`);
    } catch (e) {
      Alert.alert('Kết nối lại thất bại', (e as Error).message);
    } finally {
      setReconnectingId(null);
    }
  };

  const disconnect = useMutation({
    mutationFn: (id: string) => disconnectDriveAccount(id),
    onSuccess: () => refetchDriveAccounts(),
    onError: (e) => Alert.alert('Không ngắt kết nối được', (e as Error).message),
  });

  // Hồ sơ hành nghề (tab Khám phá) — opt-in, mặc định tắt.
  const { data: meFull, refetch: refetchMeFull } = useQuery({
    queryKey: ['me-full'],
    queryFn: () => api<MeFull>('/me'),
  });

  const connectTelegram = useMutation({
    mutationFn: () => api<{ deepLink?: string; error?: string }>('/me/telegram-link', { method: 'POST' }),
    onSuccess: async (res) => {
      if (res.error || !res.deepLink) {
        Alert.alert('Chưa dùng được Telegram', res.error ?? 'Server chưa cấu hình Telegram Bot');
        return;
      }
      await Linking.openURL(res.deepLink);
    },
    onError: (e) => Alert.alert('Lỗi', (e as Error).message),
  });

  const disconnectTelegram = useMutation({
    mutationFn: () => api('/me/telegram-link', { method: 'DELETE' }),
    onSuccess: () => refetchMeFull(),
    onError: (e) => Alert.alert('Lỗi', (e as Error).message),
  });
  const [profileInitialized, setProfileInitialized] = useState(false);
  const [availableForHire, setAvailableForHire] = useState(false);
  const [offeredRoles, setOfferedRoles] = useState<ProjectRole[]>([]);
  const [bio, setBio] = useState('');
  const [serviceArea, setServiceArea] = useState('');

  useEffect(() => {
    if (!meFull || profileInitialized) return;
    setAvailableForHire(meFull.availableForHire);
    setOfferedRoles(meFull.offeredRoles);
    setBio(meFull.bio ?? '');
    setServiceArea(meFull.serviceArea ?? '');
    setProfileInitialized(true);
  }, [meFull, profileInitialized]);

  const toggleOfferedRole = (r: ProjectRole) =>
    setOfferedRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));

  const saveProfessionalProfile = useMutation({
    mutationFn: () =>
      api('/me/professional-profile', {
        method: 'PATCH',
        body: { availableForHire, offeredRoles, bio, serviceArea },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me-full'] });
      Alert.alert('Đã lưu', 'Hồ sơ hành nghề của bạn đã được cập nhật.');
    },
    onError: (e) => Alert.alert('Không lưu được', (e as Error).message),
  });

  // Lời mời tham gia dự án — cả mời bằng SĐT lẫn từ tab Khám phá đều cần chấp nhận.
  const { data: myInvites } = useQuery({
    queryKey: ['my-invites'],
    queryFn: () => api<ProjectInvite[]>('/me/invites'),
  });
  // Theo dõi riêng invite đang xử lý (thay vì respondInvite.isPending dùng chung) — tránh khoảng
  // trống UI giữa lúc mutation xong (isPending về false) và lúc invalidateQueries fetch lại xong,
  // dễ khiến người dùng bấm lần 2 vào lúc đó và dính lỗi "lời mời đã được xử lý rồi".
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const respondInvite = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) =>
      api(`/invites/${id}/respond`, { method: 'POST', body: { accept } }),
    onMutate: ({ id }) => setRespondingId(id),
    onSuccess: (_data, { id }) => {
      // Gỡ khỏi cache ngay (không đợi round-trip refetch) để UI phản hồi tức thì.
      qc.setQueryData<ProjectInvite[]>(['my-invites'], (old) =>
        (old ?? []).filter((i) => i.id !== id),
      );
      qc.invalidateQueries({ queryKey: ['my-invites'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
    onSettled: () => setRespondingId(null),
    onError: (e) => Alert.alert('Lỗi', (e as Error).message),
  });

  const myProjects = (projects ?? []).map((p) => ({
    project: p,
    role: p.members.find((m) => m.userId === user?.id)?.role,
  }));

  const confirmLogout = () =>
    Alert.alert('Đăng xuất?', 'Bạn cần đăng nhập lại bằng OTP ở lần sau.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Đăng xuất',
        style: 'destructive',
        onPress: () => {
          qc.clear();
          logout();
        },
      },
    ]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(user?.name ?? '?').charAt(0).toUpperCase()}</Text>
        </View>
        {editingName ? (
          <View style={styles.nameEditRow}>
            <TextInput
              style={styles.nameInput}
              value={nameInput}
              onChangeText={setNameInput}
              autoFocus
              maxLength={60}
              placeholder="Tên hiển thị"
            />
            <TouchableOpacity
              disabled={!nameInput.trim() || saveName.isPending}
              onPress={() => saveName.mutate(nameInput.trim())}
              style={styles.nameSaveBtn}
            >
              {saveName.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Feather name="check" size={16} color="#fff" />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setNameInput(user?.name ?? '');
                setEditingName(false);
              }}
              style={styles.nameCancelBtn}
            >
              <Feather name="x" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.nameRow}
            onPress={() => {
              setNameInput(user?.name ?? '');
              setEditingName(true);
            }}
          >
            <Text style={styles.name}>{user?.name}</Text>
            <Feather name="edit-2" size={14} color={colors.textMuted} />
          </TouchableOpacity>
        )}
        {/* Tài khoản email+mật khẩu không có SĐT — hiện email thay thế khi thiếu SĐT. */}
        <Text style={styles.phone}>{user?.phone || user?.email}</Text>
      </View>

      <TouchableOpacity style={styles.subscriptionRow} onPress={() => router.push('/subscription')}>
        <Feather name="credit-card" size={18} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.subscriptionTitle}>Gói & Thanh toán</Text>
          <Text style={styles.driveHint}>Xem gói đang dùng, nâng cấp AI Premium</Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.textMuted} />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.subscriptionRow, { marginTop: 8 }]}
        onPress={() => router.push('/affiliate')}
      >
        <Feather name="users" size={18} color={colors.affiliate} />
        <View style={{ flex: 1 }}>
          <Text style={styles.subscriptionTitle}>Affiliate / Cộng tác viên</Text>
          <Text style={styles.driveHint}>Giới thiệu khách, nhận hoa hồng</Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.textMuted} />
      </TouchableOpacity>

      {(projects ?? []).some((p) => p.members.some((m) => m.userId === user?.id && m.role !== 'OWNER')) && (
        <TouchableOpacity style={[styles.subscriptionRow, { marginTop: 8 }]} onPress={() => router.push(`/candidate/${user?.id}`)}>
          <Feather name="award" size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.subscriptionTitle}>Hồ sơ năng lực</Text>
            <Text style={styles.driveHint}>Công trình đã làm, đánh giá — gửi cho khách mới</Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      )}

      {(myInvites ?? []).length > 0 && (
        <>
          <View style={styles.sectionDivider} />
          <Text style={styles.section}>Lời mời tham gia dự án</Text>
          {(myInvites ?? []).map((inv) => (
            <View key={inv.id} style={styles.inviteRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.projectName}>{inv.project?.name}</Text>
                <Text style={styles.driveHint}>
                  {inv.inviter?.name} mời bạn làm {roleLabel[inv.role]}
                </Text>
              </View>
              <TouchableOpacity
                disabled={respondingId === inv.id}
                style={[styles.inviteAcceptBtn, respondingId === inv.id && { opacity: 0.5 }]}
                onPress={() => respondInvite.mutate({ id: inv.id, accept: true })}
              >
                <Text style={styles.inviteAcceptText}>
                  {respondingId === inv.id ? 'Đang xử lý…' : 'Chấp nhận'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={respondingId === inv.id}
                style={[styles.inviteDeclineBtn, respondingId === inv.id && { opacity: 0.5 }]}
                onPress={() => respondInvite.mutate({ id: inv.id, accept: false })}
              >
                <Text style={styles.inviteDeclineText}>Từ chối</Text>
              </TouchableOpacity>
            </View>
          ))}
        </>
      )}

      <View style={styles.sectionDivider} />
      <Text style={styles.section}>Công trình đang tham gia</Text>
      {myProjects.length === 0 && (
        <Text style={styles.empty}>Chưa tham gia công trình nào.</Text>
      )}
      {myProjects.slice(0, PROJECTS_PREVIEW_COUNT).map(({ project, role }) => {
        const statusMeta = projectStatusMeta[project.status] ?? projectStatusMeta.DRAFT;
        return (
          <TouchableOpacity
            key={project.id}
            style={styles.projectRow}
            onPress={() => router.push(`/project/${project.id}`)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.projectName}>{project.name}</Text>
              <View style={[styles.statusBadge, { backgroundColor: `${statusMeta.color}1A` }]}>
                <Text style={[styles.statusBadgeText, { color: statusMeta.color }]}>
                  {statusMeta.label}
                </Text>
              </View>
            </View>
            <Text style={styles.roleChip}>{roleLabel[role ?? ''] ?? 'Chưa rõ'}</Text>
          </TouchableOpacity>
        );
      })}
      {myProjects.length > PROJECTS_PREVIEW_COUNT && (
        <TouchableOpacity style={styles.viewAllBtn} onPress={() => router.push('/')}>
          <Text style={styles.viewAllText}>Xem tất cả ({myProjects.length})</Text>
          <Feather name="chevron-right" size={16} color={colors.primary} />
        </TouchableOpacity>
      )}

      <View style={styles.sectionDivider} />
      <Text style={styles.section}>Tài khoản Google Drive</Text>
      <Text style={styles.driveHint}>
        Ảnh/video công trình được lưu vào Drive của tài khoản đã kết nối. Chọn tài khoản dùng cho
        từng công trình lúc tạo.
      </Text>
      {(driveAccounts ?? []).length === 0 && (
        <Text style={styles.empty}>Chưa kết nối tài khoản Drive nào.</Text>
      )}
      {(driveAccounts ?? []).map((acc: GoogleDriveAccount) => (
        <View key={acc.id} style={styles.driveRow}>
          <Text style={styles.driveEmail}>{acc.email}</Text>
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
            <TouchableOpacity
              disabled={reconnectingId === acc.id}
              onPress={() => handleReconnectDrive(acc)}
            >
              {reconnectingId === acc.id ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.driveReconnect}>Kết nối lại</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              disabled={disconnect.isPending}
              onPress={() =>
                Alert.alert('Ngắt kết nối tài khoản này?', acc.email, [
                  { text: 'Hủy', style: 'cancel' },
                  {
                    text: 'Ngắt kết nối',
                    style: 'destructive',
                    onPress: () => disconnect.mutate(acc.id),
                  },
                ])
              }
            >
              <Text style={styles.driveDisconnect}>Ngắt kết nối</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
      <TouchableOpacity
        style={styles.driveConnectBtn}
        disabled={connecting}
        onPress={handleConnectDrive}
      >
        {connecting ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text style={styles.driveConnectText}>+ Kết nối tài khoản Drive</Text>
        )}
      </TouchableOpacity>

      <View style={styles.sectionDivider} />
      <Text style={styles.section}>Thông báo qua Telegram</Text>
      <Text style={styles.driveHint}>
        Nhận thông báo dự án song song với push, không bỏ lỡ khi tắt thông báo app.
      </Text>
      {meFull?.telegramChatId ? (
        <View style={styles.driveRow}>
          <Text style={styles.driveEmail}>Đã kết nối Telegram</Text>
          <TouchableOpacity
            disabled={disconnectTelegram.isPending}
            onPress={() =>
              Alert.alert('Ngắt kết nối Telegram?', undefined, [
                { text: 'Hủy', style: 'cancel' },
                {
                  text: 'Ngắt kết nối',
                  style: 'destructive',
                  onPress: () => disconnectTelegram.mutate(),
                },
              ])
            }
          >
            <Text style={styles.driveDisconnect}>Ngắt kết nối</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.driveConnectBtn}
          disabled={connectTelegram.isPending}
          onPress={() => connectTelegram.mutate()}
        >
          {connectTelegram.isPending ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={styles.driveConnectText}>+ Kết nối Telegram</Text>
          )}
        </TouchableOpacity>
      )}

      {meFull?.eligibleForProfessionalProfile && (
        <>
          <View style={styles.sectionDivider} />
          <Text style={styles.section}>Hồ sơ hành nghề</Text>
          <View style={styles.proCard}>
        <View style={styles.proToggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.proToggleLabel}>Sẵn sàng nhận việc</Text>
            <Text style={styles.driveHint}>
              Bật để hiện diện ở tab Khám phá cho chủ nhà chưa quen ai tìm thấy bạn.
            </Text>
          </View>
          <Switch
            value={availableForHire}
            onValueChange={setAvailableForHire}
            trackColor={{ true: colors.primary }}
          />
        </View>

        {availableForHire && (
          <>
            <Text style={styles.label}>Vai trò nhận việc</Text>
            <View style={styles.chipRow}>
              {OFFERED_ROLE_OPTIONS.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.chip, offeredRoles.includes(r) && styles.chipActive]}
                  onPress={() => toggleOfferedRole(r)}
                >
                  <Text
                    style={[styles.chipText, offeredRoles.includes(r) && styles.chipTextActive]}
                  >
                    {roleLabel[r]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Khu vực hoạt động</Text>
            <TextInput
              style={styles.input}
              placeholder="VD: TP.HCM, Bình Dương"
              value={serviceArea}
              onChangeText={setServiceArea}
            />

            <Text style={styles.label}>Giới thiệu ngắn</Text>
            <TextInput
              style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]}
              placeholder="Kinh nghiệm, thế mạnh, loại công trình hay làm…"
              value={bio}
              onChangeText={setBio}
              multiline
              maxLength={500}
            />
          </>
        )}

        <TouchableOpacity
          style={[styles.saveProBtn, saveProfessionalProfile.isPending && { opacity: 0.6 }]}
          disabled={saveProfessionalProfile.isPending}
          onPress={() => saveProfessionalProfile.mutate()}
        >
          {saveProfessionalProfile.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveProBtnText}>Lưu hồ sơ hành nghề</Text>
          )}
        </TouchableOpacity>
          </View>
        </>
      )}

      <View style={styles.sectionDivider} />
      <TouchableOpacity style={styles.logoutBtn} onPress={confirmLogout}>
        <Text style={styles.logoutText}>Đăng xuất</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  avatarText: { fontSize: 22, fontWeight: '800', color: colors.primary },
  name: { fontSize: 17, fontWeight: '800', color: colors.text },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%' },
  nameInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15, color: colors.text,
    textAlign: 'center',
  },
  nameSaveBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameCancelBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phone: { color: colors.textMuted, marginTop: 2 },
  subscriptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  subscriptionTitle: { fontWeight: '700', color: colors.text, fontSize: 14 },
  sectionDivider: { height: 1, backgroundColor: colors.border, marginTop: 22, marginBottom: 18 },
  section: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  empty: { color: colors.textMuted, marginBottom: 16 },
  projectRow: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  projectName: { fontWeight: '700', color: colors.text, marginBottom: 6 },
  statusBadge: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  roleChip: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: colors.primaryLight,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
  },
  viewAllText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  logoutBtn: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  logoutText: { color: colors.danger, fontWeight: '700' },
  driveHint: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginBottom: 10 },
  driveRow: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
  },
  driveEmail: { color: colors.text, fontSize: 13, fontWeight: '600', flex: 1 },
  driveDisconnect: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  driveReconnect: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  driveConnectBtn: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  driveConnectText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  inviteRow: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  inviteAcceptBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  inviteAcceptText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  inviteDeclineBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  inviteDeclineText: { color: colors.textMuted, fontWeight: '700', fontSize: 12 },
  proCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  proToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  proToggleLabel: { fontWeight: '700', color: colors.text, fontSize: 14 },
  label: { fontWeight: '700', color: colors.text, marginBottom: 8, marginTop: 12, fontSize: 13 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.bg,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, color: colors.text },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 14, color: colors.text,
  },
  saveProBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  saveProBtnText: { color: '#fff', fontWeight: '700' },
});
