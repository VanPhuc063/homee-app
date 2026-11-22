import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useGlobalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/api/client';
import { Feather } from '@/components/Feather';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';
import type { Project, ProjectMessage } from '@/types';

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });

/**
 * Chat nhóm dự án dạng bong bóng nổi góc phải (trên thanh tab) — bấm mở cửa sổ chat nhỏ.
 * Tag người bằng chip "@Tên" (backend gửi thông báo riêng cho người được tag).
 * Mở từ thông báo: route `/project/:id?chat=1`.
 */
export function ProjectChat({ projectId }: { projectId: string }) {
  const insets = useSafeAreaInsets();
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const { chat } = useGlobalSearchParams<{ chat?: string }>();
  const [open, setOpen] = useState(chat === '1');
  const [draft, setDraft] = useState('');
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const listRef = useRef<FlatList<ProjectMessage>>(null);

  useEffect(() => {
    if (chat === '1') setOpen(true);
  }, [chat]);

  // ponytail: polling (4s khi mở, 30s khi đóng), chuyển sang WebSocket nếu chat dùng nhiều.
  const { data: messages = [] } = useQuery({
    queryKey: ['project-messages', projectId],
    queryFn: () => api<ProjectMessage[]>(`/projects/${projectId}/messages`),
    refetchInterval: open ? 4000 : 30000,
  });
  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: () => api<Project[]>('/projects') });
  const members = (projects?.find((p) => p.id === projectId)?.members ?? []).filter((m) => m.userId !== user?.id);

  const last = messages[messages.length - 1];
  useEffect(() => {
    if (open && last) setSeenAt(last.createdAt);
  }, [open, last]);
  const unread = messages.filter((m) => m.authorId !== user?.id && (!seenAt || m.createdAt > seenAt)).length;

  const send = useMutation({
    mutationFn: (body: string) =>
      api<ProjectMessage>(`/projects/${projectId}/messages`, { method: 'POST', body: { body } }),
    onSuccess: (msg) => {
      qc.setQueryData<ProjectMessage[]>(['project-messages', projectId], (old = []) => [...old, msg]);
      setDraft('');
    },
  });

  const submit = () => {
    const body = draft.trim();
    if (body && !send.isPending) send.mutate(body);
  };
  const tag = (name: string) => setDraft((d) => `${d}${d && !d.endsWith(' ') ? ' ' : ''}@${name} `);

  return (
    <>
      <TouchableOpacity
        style={[styles.bubble, { bottom: insets.bottom + 64 }]}
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
        accessibilityLabel="Mở chat dự án"
      >
        <Feather name="message-circle" size={24} color="#fff" />
        {unread > 0 && !open && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.windowWrap, { bottom: insets.bottom + 16 }]}
          pointerEvents="box-none"
        >
          <View style={styles.window}>
            <View style={styles.header}>
              <Feather name="message-circle" size={16} color={colors.primary} />
              <Text style={styles.headerTitle}>Chat dự án</Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={12} accessibilityLabel="Đóng chat">
                <Feather name="x" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(m) => m.id}
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 10, gap: 8 }}
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
              ListEmptyComponent={<Text style={styles.empty}>Chưa có tin nhắn. Gõ @ để tag thành viên.</Text>}
              renderItem={({ item }) => {
                const mine = item.authorId === user?.id;
                return (
                  <View style={[styles.msg, mine ? styles.msgMine : styles.msgOther]}>
                    {!mine && <Text style={styles.author}>{item.author.name}</Text>}
                    <Text style={[styles.body, mine && { color: '#fff' }]}>{item.body}</Text>
                    <Text style={[styles.time, mine && { color: '#DCFCE7' }]}>{fmtTime(item.createdAt)}</Text>
                  </View>
                );
              }}
            />

            {members.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagRow} keyboardShouldPersistTaps="handled">
                {members.map((m) => (
                  <TouchableOpacity key={m.userId} style={styles.tagChip} onPress={() => tag(m.user.name)}>
                    <Text style={styles.tagText}>@{m.user.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={draft}
                onChangeText={setDraft}
                placeholder="Nhắn cho cả đội..."
                multiline
                maxLength={2000}
              />
              <TouchableOpacity
                onPress={submit}
                disabled={!draft.trim() || send.isPending}
                style={[styles.sendBtn, (!draft.trim() || send.isPending) && { opacity: 0.4 }]}
                accessibilityLabel="Gửi"
              >
                <Feather name="send" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    right: 16,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.15)' },
  windowWrap: { position: 'absolute', right: 12, left: 12, alignItems: 'flex-end' },
  window: {
    width: '100%',
    maxWidth: 380,
    height: 440,
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
  empty: { textAlign: 'center', color: colors.textMuted, fontSize: 12, marginTop: 40 },
  msg: { maxWidth: '82%', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 },
  msgMine: { alignSelf: 'flex-end', backgroundColor: colors.primary },
  msgOther: { alignSelf: 'flex-start', backgroundColor: colors.bg },
  author: { fontSize: 11, fontWeight: '700', color: colors.primary, marginBottom: 2 },
  body: { fontSize: 13, color: colors.text, lineHeight: 18 },
  time: { fontSize: 9, color: colors.textMuted, marginTop: 3, alignSelf: 'flex-end' },
  tagRow: { flexGrow: 0, paddingHorizontal: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border },
  tagChip: {
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 6,
  },
  tagText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 8, borderTopWidth: 1, borderTopColor: colors.border },
  input: {
    flex: 1,
    maxHeight: 90,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.text,
  },
  sendBtn: { backgroundColor: colors.primary, borderRadius: 10, width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
});
