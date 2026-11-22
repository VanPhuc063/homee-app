import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '@/api/client';
import { useAuth } from '@/store/auth';
import { colors, teamTypeLabel } from '@/theme';
import type { CrewMember, Phase, Project, ProjectInvite, ProjectRole, TeamType } from '@/types';

const ROLE_OPTIONS: { role: ProjectRole; label: string }[] = [
  { role: 'OWNER', label: 'Chủ nhà' },
  { role: 'MAIN_CONTRACTOR', label: 'Nhà thầu' },
  { role: 'SUPERVISOR', label: 'Giám sát' },
  { role: 'SUB_CONTRACTOR', label: 'Đội trưởng' },
];
const TEAM_TYPES: TeamType[] = ['PHAN_THO', 'SON', 'THACH_CAO', 'DA', 'KINH_CAU_THANG', 'CUA_NHOM', 'KHAC'];
const roleLabel = (r: ProjectRole) => ROLE_OPTIONS.find((x) => x.role === r)?.label ?? r;

const initials = (name: string) =>
  name
    .trim()
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

interface Row {
  id: string;
  name: string;
  role: ProjectRole;
  teamType?: TeamType | null;
  confirmed: boolean;
}

/**
 * Mời thành viên (mockup 07): email + vai trò + "Gửi lời mời", danh sách thành viên đã mời kèm
 * trạng thái Đã xác nhận / Đang chờ. Dùng trong wizard tạo dự án và nút "+ Thêm thành viên mới".
 * Chủ nhà mời Nhà thầu/Giám sát/Đội trưởng; Nhà thầu mời Chủ nhà/Giám sát/Đội trưởng.
 */
export function InviteMembers({ projectId, myRole }: { projectId: string; myRole?: ProjectRole }) {
  const qc = useQueryClient();
  const userId = useAuth((s) => s.user?.id);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ProjectRole | null>(null);
  const [teamType, setTeamType] = useState<TeamType>('PHAN_THO');
  const [name, setName] = useState('');
  // Giám sát theo từng bước (task-based) — mặc định giám sát toàn dự án.
  const [scoped, setScoped] = useState(false);
  const [stepIds, setStepIds] = useState<string[]>([]);
  const [openPhase, setOpenPhase] = useState<string | null>(null);

  const roles = ROLE_OPTIONS.filter((r) => r.role !== (myRole === 'MAIN_CONTRACTOR' ? 'MAIN_CONTRACTOR' : 'OWNER'));
  const activeRole = role ?? roles[0].role;

  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: () => api<Project[]>('/projects') });
  const { data: invites } = useQuery({
    queryKey: ['project-invites', projectId],
    queryFn: () => api<ProjectInvite[]>(`/projects/${projectId}/invites`),
  });
  const project = projects?.find((p) => p.id === projectId);
  // Đội của tôi: thầu chính chọn nhanh đội trưởng/thầu phụ đã từng làm, khỏi gõ lại.
  const { data: crew } = useQuery({
    queryKey: ['crew'],
    queryFn: () => api<CrewMember[]>('/me/crew'),
    enabled: myRole === 'MAIN_CONTRACTOR',
  });
  const { data: phases } = useQuery({
    queryKey: ['phases', projectId],
    queryFn: () => api<Phase[]>(`/projects/${projectId}/phases`),
    enabled: activeRole === 'SUPERVISOR' && scoped,
  });
  const contact = email.trim();
  const isEmail = contact.includes('@');
  const valid = isEmail || /^(0|\+84)\d{9,10}$/.test(contact.replace(/\s/g, ''));

  const rows: Row[] = [
    ...(project?.members ?? [])
      .filter((m) => m.userId !== userId)
      .map((m) => ({ id: m.userId, name: m.user.name, role: m.role, teamType: m.teamType, confirmed: true })),
    ...(invites ?? [])
      .filter((i) => i.status === 'PENDING')
      .map((i) => ({ id: i.id, name: i.invitee?.name ?? '', role: i.role, teamType: i.teamType, confirmed: false })),
  ];

  const send = useMutation({
    mutationFn: () =>
      api(`/projects/${projectId}/members`, {
        method: 'POST',
        body: {
          ...(isEmail ? { email: contact } : { phone: contact.replace(/\s/g, '') }),
          ...(name.trim() ? { name: name.trim() } : {}),
          role: activeRole,
          ...(activeRole === 'SUB_CONTRACTOR' ? { teamType } : {}),
          ...(activeRole === 'SUPERVISOR' && scoped ? { assignedStepIds: stepIds } : {}),
        },
      }),
    onSuccess: () => {
      setEmail('');
      setName('');
      setStepIds([]);
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['project-invites', projectId] });
    },
    onError: (e) => Alert.alert('Chưa gửi được lời mời', (e as Error).message),
  });

  return (
    <View>
      <Text style={styles.label}>Email hoặc số điện thoại</Text>
      <TextInput
        style={styles.input}
        placeholder="thau@email.com hoặc số điện thoại"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />
      <Text style={styles.label}>Vai trò</Text>
      <View style={styles.chipRow}>
        {roles.map((r) => (
          <TouchableOpacity
            key={r.role}
            style={[styles.chip, activeRole === r.role && styles.chipActive]}
            onPress={() => setRole(r.role)}
          >
            <Text style={[styles.chipText, activeRole === r.role && styles.chipTextActive]}>{r.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {activeRole === 'SUB_CONTRACTOR' && !!crew?.length && (
        <>
          <Text style={styles.label}>Chọn từ Đội của tôi</Text>
          <View style={styles.chipRow}>
            {crew.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[styles.chip, email === c.phone && styles.chipActive]}
                onPress={() => {
                  setEmail(c.phone);
                  setName(c.name);
                }}
              >
                <Text style={[styles.chipText, email === c.phone && styles.chipTextActive]}>{c.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
      {activeRole === 'SUPERVISOR' && (
        <>
          <TouchableOpacity style={styles.toggleRow} onPress={() => setScoped((v) => !v)}>
            <View style={[styles.box, scoped && styles.boxOn]} />
            <Text style={styles.toggleText}>Chỉ giám sát một số bước (mặc định: toàn dự án)</Text>
          </TouchableOpacity>
          {scoped && (
            <View style={styles.stepBox}>
              {(phases ?? []).map((p) => (
                <View key={p.id}>
                  <TouchableOpacity onPress={() => setOpenPhase(openPhase === p.id ? null : p.id)}>
                    <Text style={styles.phaseHead}>
                      {openPhase === p.id ? '▾' : '▸'} {p.code}: {p.name}
                      {p.steps.some((x) => stepIds.includes(x.id)) ? ` (${p.steps.filter((x) => stepIds.includes(x.id)).length})` : ''}
                    </Text>
                  </TouchableOpacity>
                  {openPhase === p.id &&
                    p.steps.map((st) => {
                      const on = stepIds.includes(st.id);
                      return (
                        <TouchableOpacity
                          key={st.id}
                          style={styles.toggleRow}
                          onPress={() => setStepIds((prev) => (on ? prev.filter((x) => x !== st.id) : [...prev, st.id]))}
                        >
                          <View style={[styles.box, on && styles.boxOn]} />
                          <Text style={styles.stepText}>{st.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                </View>
              ))}
            </View>
          )}
        </>
      )}
      {activeRole === 'SUB_CONTRACTOR' && (
        <>
          <Text style={styles.label}>Đội</Text>
          <View style={styles.chipRow}>
            {TEAM_TYPES.map((t) => (
              <TouchableOpacity key={t} style={[styles.chip, teamType === t && styles.chipActive]} onPress={() => setTeamType(t)}>
                <Text style={[styles.chipText, teamType === t && styles.chipTextActive]}>{teamTypeLabel[t]}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
      <TouchableOpacity
        style={[styles.btn, (!valid || (scoped && activeRole === 'SUPERVISOR' && !stepIds.length) || send.isPending) && { opacity: 0.6 }]}
        disabled={!valid || (scoped && activeRole === 'SUPERVISOR' && !stepIds.length) || send.isPending}
        onPress={() => send.mutate()}
      >
        {send.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Gửi lời mời</Text>}
      </TouchableOpacity>

      {rows.length > 0 && <Text style={styles.section}>Thành viên đã mời</Text>}
      {rows.map((m) => (
        <View key={m.id} style={styles.row}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(m.name)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{m.name}</Text>
            <Text style={styles.sub}>
              {roleLabel(m.role)}
              {m.role === 'SUB_CONTRACTOR' && m.teamType ? ` — ${teamTypeLabel[m.teamType]}` : ''}
            </Text>
          </View>
          <Text style={[styles.badge, m.confirmed ? styles.badgeGreen : styles.badgeAmber]}>
            {m.confirmed ? 'Đã xác nhận' : 'Đang chờ'}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Số người theo vai trò cho dòng "Thành viên: 3 người (1 thầu, 1 GS, 1 ĐT)" (mockup 08). */
export function useInvitedSummary(projectId?: string) {
  const userId = useAuth((s) => s.user?.id);
  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: () => api<Project[]>('/projects'), enabled: !!projectId });
  const { data: invites } = useQuery({
    queryKey: ['project-invites', projectId],
    queryFn: () => api<ProjectInvite[]>(`/projects/${projectId}/invites`),
    enabled: !!projectId,
  });
  const project = projects?.find((p) => p.id === projectId);
  const all: ProjectRole[] = [
    ...(project?.members ?? []).filter((m) => m.userId !== userId).map((m) => m.role),
    ...(invites ?? []).filter((i) => i.status === 'PENDING').map((i) => i.role),
  ];
  const c = (r: ProjectRole) => all.filter((x) => x === r).length;
  const parts = [
    c('OWNER') && `${c('OWNER')} chủ nhà`,
    c('MAIN_CONTRACTOR') && `${c('MAIN_CONTRACTOR')} thầu`,
    c('SUPERVISOR') && `${c('SUPERVISOR')} GS`,
    c('SUB_CONTRACTOR') && `${c('SUB_CONTRACTOR')} ĐT`,
  ].filter(Boolean);
  return `${all.length} người${parts.length ? ` (${parts.join(', ')})` : ''}`;
}

const styles = StyleSheet.create({
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
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: { borderWidth: 1.5, borderColor: '#E5E5E5', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  chipText: { fontSize: 13, color: colors.text, fontWeight: '600' },
  chipTextActive: { color: colors.primary },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  box: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: '#9CA3AF' },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  toggleText: { fontSize: 13, color: colors.text, flex: 1 },
  stepBox: { borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 10, padding: 10, marginBottom: 14, maxHeight: 280 },
  phaseHead: { fontSize: 13, fontWeight: '700', color: colors.text, paddingVertical: 6 },
  stepText: { fontSize: 12, color: colors.text, flex: 1 },
  btn: { backgroundColor: colors.primary, borderRadius: 10, padding: 14, alignItems: 'center', minHeight: 50, justifyContent: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  section: { fontSize: 14, fontWeight: '800', color: colors.text, marginTop: 18, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 12, fontWeight: '800', color: colors.primary },
  name: { fontSize: 13, fontWeight: '700', color: colors.text },
  sub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  badge: { fontSize: 10, fontWeight: '700', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  badgeGreen: { color: colors.primary, backgroundColor: colors.primaryLight },
  badgeAmber: { color: '#B45309', backgroundColor: '#FFFBEB' },
});
