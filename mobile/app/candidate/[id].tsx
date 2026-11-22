import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '@/api/client';
import { useAuth } from '@/store/auth';
import { colors, roleLabel } from '@/theme';
import type { Candidate, Phase, Project, ProjectRole } from '@/types';

const INVITE_ROLES: ProjectRole[] = ['MAIN_CONTRACTOR', 'SUB_CONTRACTOR', 'SUPERVISOR'];

export default function CandidateDetail() {
  const { id: candidateId } = useLocalSearchParams<{ id: string }>();
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();

  const [inviting, setInviting] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [role, setRole] = useState<ProjectRole | null>(null);
  const [phaseCodes, setPhaseCodes] = useState<string[]>([]);
  // Giám sát mặc định xem toàn bộ dự án — bật "theo từng bước" để mời chỉ cho 1 vài bước cụ thể
  // (task-based), khớp app/project/[id]/members.tsx và ProjectsService.assertCanInvite (backend).
  const [supervisorScoped, setSupervisorScoped] = useState(false);
  const [stepIds, setStepIds] = useState<string[]>([]);
  const [expandedPhaseCode, setExpandedPhaseCode] = useState<string | null>(null);

  const { data: candidate, isLoading } = useQuery({
    queryKey: ['candidate', candidateId],
    queryFn: () => api<Candidate>(`/directory/candidates/${candidateId}`),
    enabled: !!candidateId,
  });

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/projects'),
  });
  const myProjects = (projects ?? []).filter(
    (p) => p.members.find((m) => m.userId === user?.id)?.role === 'OWNER',
  );

  const availableRoles = candidate
    ? INVITE_ROLES.filter((r) => candidate.offeredRoles.includes(r))
    : INVITE_ROLES;
  const selectedProject = myProjects.find((p) => p.id === projectId);
  const hasFullProjectSupervisor = (selectedProject?.members ?? []).some(
    (m) => m.role === 'SUPERVISOR' && m.assignedPhaseCodes.length === 0 && m.assignedStepIds.length === 0,
  );

  // Danh sách hạng mục + bước đầy đủ (Project.phases rút gọn, không có steps) — cần cho picker
  // "mời giám sát theo từng bước".
  const { data: phasesWithSteps } = useQuery({
    queryKey: ['phases', projectId],
    queryFn: () => api<Phase[]>(`/projects/${projectId}/phases`),
    enabled: !!projectId && role === 'SUPERVISOR',
  });

  const togglePhase = (code: string) =>
    setPhaseCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );

  const toggleStep = (stepId: string) =>
    setStepIds((prev) =>
      prev.includes(stepId) ? prev.filter((id) => id !== stepId) : [...prev, stepId],
    );

  const sendInvite = useMutation({
    mutationFn: () =>
      api(`/projects/${projectId}/invites`, {
        method: 'POST',
        body: {
          inviteeId: candidateId,
          role,
          assignedPhaseCodes: role === 'SUB_CONTRACTOR' ? phaseCodes : [],
          assignedStepIds: role === 'SUPERVISOR' && supervisorScoped ? stepIds : [],
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-invites', projectId] });
      Alert.alert(
        'Đã gửi lời mời',
        'Chờ người này chấp nhận. Bạn có thể theo dõi trạng thái ở tab Thành viên của dự án.',
      );
      setInviting(false);
      setProjectId(null);
      setRole(null);
      setPhaseCodes([]);
      setStepIds([]);
      setSupervisorScoped(false);
    },
    onError: (e) => Alert.alert('Không mời được', (e as Error).message),
  });

  if (isLoading || !candidate) {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>{isLoading ? 'Đang tải…' : 'Không tìm thấy ứng viên này.'}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{candidate.name.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{candidate.name}</Text>
        {candidate.avgRating != null && (
          <Text style={styles.rating}>
            ★ {candidate.avgRating.toFixed(1)} · {candidate.reviewCount} đánh giá
          </Text>
        )}
        <View style={styles.rolesRow}>
          {candidate.offeredRoles.map((r) => (
            <Text key={r} style={styles.roleChip}>
              {roleLabel[r]}
            </Text>
          ))}
        </View>
        {!!candidate.serviceArea && (
          <Text style={styles.meta}>Khu vực hoạt động: {candidate.serviceArea}</Text>
        )}
      </View>

      {!!candidate.bio && (
        <>
          <Text style={styles.section}>Giới thiệu</Text>
          <Text style={styles.bio}>{candidate.bio}</Text>
        </>
      )}

      <Text style={styles.section}>Kinh nghiệm</Text>
      {candidate.completedProjects.length === 0 ? (
        <Text style={styles.meta}>Chưa có dự án hoàn thành nào trên Homeee.</Text>
      ) : (
        candidate.completedProjects.map((c) => (
          <Text key={c.role} style={styles.meta}>
            {c.count} dự án đã hoàn thành với vai trò {roleLabel[c.role]}
          </Text>
        ))
      )}

      {myProjects.length === 0 ? (
        <Text style={styles.hint}>
          Bạn cần là chủ nhà của ít nhất 1 dự án để mời người này tham gia.
        </Text>
      ) : !inviting ? (
        <TouchableOpacity style={styles.inviteBtn} onPress={() => setInviting(true)}>
          <Text style={styles.inviteBtnText}>Mời vào dự án</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.form}>
          <Text style={styles.label}>Chọn dự án</Text>
          <View style={styles.chipRow}>
            {myProjects.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.chip, projectId === p.id && styles.chipActive]}
                onPress={() => setProjectId(p.id)}
              >
                <Text style={[styles.chipText, projectId === p.id && styles.chipTextActive]}>
                  {p.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Vai trò mời</Text>
          <View style={styles.chipRow}>
            {availableRoles.map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.chip, role === r && styles.chipActive]}
                onPress={() => setRole(r)}
              >
                <Text style={[styles.chipText, role === r && styles.chipTextActive]}>
                  {roleLabel[r]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {role === 'SUB_CONTRACTOR' && selectedProject && (
            <>
              <Text style={styles.label}>Gán hạng mục</Text>
              <View style={styles.chipRow}>
                {selectedProject.phases
                  .sort((a, b) => a.order - b.order)
                  .map((ph) => (
                    <TouchableOpacity
                      key={ph.code}
                      style={[styles.chip, phaseCodes.includes(ph.code) && styles.chipActive]}
                      onPress={() => togglePhase(ph.code)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          phaseCodes.includes(ph.code) && styles.chipTextActive,
                        ]}
                      >
                        {ph.code}
                      </Text>
                    </TouchableOpacity>
                  ))}
              </View>
            </>
          )}

          {role === 'SUPERVISOR' && selectedProject && (
            <>
              <Text style={styles.label}>Phạm vi giám sát</Text>
              <View style={{ gap: 8, marginBottom: 8 }}>
                <TouchableOpacity
                  style={!supervisorScoped ? styles.chipActive : styles.chip}
                  onPress={() => {
                    setSupervisorScoped(false);
                    setStepIds([]);
                  }}
                  disabled={hasFullProjectSupervisor}
                >
                  <Text style={[styles.chipText, !supervisorScoped && styles.chipTextActive]}>
                    Toàn bộ dự án — giám sát toàn thời gian/bán thời gian
                  </Text>
                </TouchableOpacity>
                {hasFullProjectSupervisor && !supervisorScoped && (
                  <Text style={styles.hint}>
                    Dự án đã có giám sát xem toàn bộ — chỉ mời thêm được giám sát theo từng bước.
                  </Text>
                )}
                <TouchableOpacity
                  style={supervisorScoped ? styles.chipActive : styles.chip}
                  onPress={() => setSupervisorScoped(true)}
                >
                  <Text style={[styles.chipText, supervisorScoped && styles.chipTextActive]}>
                    Theo từng bước cụ thể (task-based)
                  </Text>
                </TouchableOpacity>
              </View>

              {supervisorScoped && (
                <>
                  <Text style={styles.label}>Chọn bước ({stepIds.length} đã chọn)</Text>
                  {(phasesWithSteps ?? [])
                    .slice()
                    .sort((a, b) => a.order - b.order)
                    .map((ph) => {
                      const expanded = expandedPhaseCode === ph.code;
                      const selectedInPhase = ph.steps.filter((s) => stepIds.includes(s.id)).length;
                      return (
                        <View key={ph.code} style={styles.phaseGroup}>
                          <TouchableOpacity
                            style={styles.phaseGroupHeader}
                            onPress={() => setExpandedPhaseCode(expanded ? null : ph.code)}
                          >
                            <Text style={styles.phaseGroupTitle}>
                              {ph.code} {ph.name}
                              {selectedInPhase > 0 ? ` (${selectedInPhase})` : ''}
                            </Text>
                          </TouchableOpacity>
                          {expanded && (
                            <View style={{ paddingLeft: 10, paddingBottom: 8, gap: 6 }}>
                              {ph.steps.map((s) => (
                                <TouchableOpacity key={s.id} onPress={() => toggleStep(s.id)}>
                                  <Text
                                    style={
                                      stepIds.includes(s.id)
                                        ? styles.stepPickTextActive
                                        : styles.stepPickText
                                    }
                                  >
                                    {stepIds.includes(s.id) ? '☑' : '☐'} {s.order}. {s.name}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          )}
                        </View>
                      );
                    })}
                </>
              )}
            </>
          )}

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => {
                setInviting(false);
                setProjectId(null);
                setRole(null);
                setPhaseCodes([]);
                setStepIds([]);
                setSupervisorScoped(false);
              }}
            >
              <Text style={styles.cancelBtnText}>Hủy</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.submitBtn,
                (!projectId ||
                  !role ||
                  sendInvite.isPending ||
                  (role === 'SUPERVISOR' && supervisorScoped && stepIds.length === 0)) && {
                  opacity: 0.5,
                },
              ]}
              disabled={
                !projectId ||
                !role ||
                sendInvite.isPending ||
                (role === 'SUPERVISOR' && supervisorScoped && stepIds.length === 0)
              }
              onPress={() => sendInvite.mutate()}
            >
              <Text style={styles.submitBtnText}>
                {sendInvite.isPending ? 'Đang gửi…' : 'Gửi lời mời'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
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
  name: { fontSize: 18, fontWeight: '800', color: colors.text },
  rating: { color: colors.warning, fontWeight: '700', fontSize: 13, marginTop: 4 },
  rolesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, justifyContent: 'center' },
  roleChip: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: colors.primaryLight,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  meta: { color: colors.textMuted, fontSize: 13, marginTop: 6, textAlign: 'center' },
  section: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 8, marginTop: 8 },
  bio: { color: colors.text, fontSize: 13, lineHeight: 19, marginBottom: 8 },
  hint: { textAlign: 'center', color: colors.textMuted, fontSize: 12, marginTop: 20 },
  inviteBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  inviteBtnText: { color: '#fff', fontWeight: '700' },
  form: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { fontWeight: '700', color: colors.text, marginBottom: 8, marginTop: 4, fontSize: 13 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
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
  phaseGroup: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    marginBottom: 8,
    overflow: 'hidden',
  },
  phaseGroupHeader: { padding: 10, backgroundColor: colors.bg },
  phaseGroupTitle: { fontSize: 12, fontWeight: '700', color: colors.text },
  stepPickText: { fontSize: 12, color: colors.text, paddingVertical: 4 },
  stepPickTextActive: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '700',
    paddingVertical: 4,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  cancelBtnText: { color: colors.textMuted, fontWeight: '700' },
  submitBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  submitBtnText: { color: '#fff', fontWeight: '700' },
});
