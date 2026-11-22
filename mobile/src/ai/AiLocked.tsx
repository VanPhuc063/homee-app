import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '@/api/client';
import { Feather } from '@/components/Feather';
import { colors } from '@/theme';

/** Dự án đã mở khoá AI chưa (GET /projects/:id/ai/status). */
export function useAiUnlocked(projectId?: string) {
  const { data } = useQuery({
    queryKey: ['ai-status', projectId],
    queryFn: () => api<{ unlocked: boolean }>(`/projects/${projectId}/ai/status`),
    enabled: !!projectId,
  });
  return data?.unlocked;
}

export const isAiPremiumError = (e: unknown) => (e as Error)?.message === 'AI_PREMIUM_REQUIRED';

/**
 * Thẻ AI bị khoá (mockup 13, 34): khung tím nét đứt, icon khoá, mô tả, "✨ Mở khoá AI — 700.000đ".
 * Bấm vào mở màn AI Premium (mockup 28).
 */
export function AiLocked({
  title,
  description,
  bullets,
  footer = '1 lần duy nhất, dùng vĩnh viễn',
  icon = 'lock',
}: {
  title: string;
  description: string;
  bullets?: string[];
  footer?: string;
  icon?: 'lock' | 'zap';
}) {
  const router = useRouter();
  return (
    <TouchableOpacity style={styles.box} activeOpacity={0.85} onPress={() => router.push('/subscription/ai')}>
      <View style={styles.titleRow}>
        <Feather name={icon} size={16} color={colors.ai} />
        <Text style={styles.title}>{title}</Text>
      </View>
      <Text style={styles.desc}>{description}</Text>
      {bullets && (
        <View style={styles.bullets}>
          {bullets.map((b) => (
            <Text key={b} style={styles.bullet}>
              {b}
            </Text>
          ))}
        </View>
      )}
      <Text style={styles.unlock}>✨ Mở khoá AI — 700.000đ</Text>
      <Text style={styles.footer}>{footer}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#C4B5FD',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 14, fontWeight: '800', color: '#5B21B6' },
  desc: { fontSize: 12, color: '#6D28D9', textAlign: 'center', marginTop: 6, lineHeight: 17 },
  bullets: { alignSelf: 'stretch', marginTop: 8, gap: 4 },
  bullet: { fontSize: 12, color: '#6D28D9' },
  unlock: { fontSize: 13, fontWeight: '800', color: '#A78BFA', marginTop: 12 },
  footer: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
});

/** Bọc cả màn AI: chưa mở khoá thì hiện thẻ khoá (mockup 34) thay cho nội dung. */
export function AiGate({
  projectId,
  title,
  description,
  children,
}: {
  projectId?: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const unlocked = useAiUnlocked(projectId);
  if (unlocked === undefined) return null;
  if (unlocked) return <>{children}</>;
  return (
    <View style={{ flex: 1, backgroundColor: '#fff', padding: 16 }}>
      <AiLocked title={title} description={description} />
    </View>
  );
}
