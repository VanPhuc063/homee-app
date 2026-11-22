import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
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
import { Feather } from '@/components/Feather';
import { registerPushToken } from '@/notifications';
import { useAuth, AuthUser } from '@/store/auth';
import { colors } from '@/theme';

type OnboardRole = 'OWNER' | 'MAIN_CONTRACTOR';

/**
 * Đăng ký/Đăng nhập bằng Email + Mật khẩu — lựa chọn phụ; luồng chính là SĐT + OTP qua Zalo
 * (login/index.tsx).
 *
 * "Chọn vai trò" khi đăng ký thuần tuý để định hướng người dùng (chủ nhà vs nhà thầu) — không có
 * field riêng ở User lưu lại, vì vai trò thật sự gắn theo từng dự án (ProjectMember.role), 1 người
 * có thể vừa là chủ nhà 1 dự án vừa là thầu ở dự án khác. Sau đăng ký, mọi vai trò đều vào chung
 * màn "Công trình của tôi" — chủ nhà tạo dự án mới, nhà thầu chờ được mời hoặc tự tạo nếu cần.
 */
export default function Login() {
  const router = useRouter();
  const [isRegister, setIsRegister] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<OnboardRole>('OWNER');
  const [showReferral, setShowReferral] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [loading, setLoading] = useState(false);
  const setSession = useAuth((s) => s.setSession);
  const setJustRegistered = useAuth((s) => s.setJustRegistered);
  const qc = useQueryClient();

  const canSubmit = isRegister
    ? name.trim().length > 0 && email.includes('@') && password.length >= 6
    : email.includes('@') && password.length > 0;

  const submit = async () => {
    setLoading(true);
    try {
      const path = isRegister ? '/auth/register' : '/auth/login';
      const body = isRegister
        ? { name: name.trim(), email: email.trim(), password, referralCode: referralCode.trim() || undefined }
        : { email: email.trim(), password };
      const res = await api<{ user: AuthUser; accessToken: string; refreshToken: string }>(path, {
        method: 'POST',
        body,
        auth: false,
      });
      qc.clear();
      setJustRegistered(isRegister);
      await setSession(isRegister ? { ...res.user, signupRole: role } : res.user, res.accessToken, res.refreshToken);
      registerPushToken();
    } catch (e) {
      Alert.alert('Lỗi', (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
        <View style={styles.logoBox}>
          <Feather name="home" size={28} color="#fff" />
        </View>
        <Text style={styles.logo}>Nhật Ký Thi Công</Text>
        <Text style={styles.tagline}>Quản lý thi công thông minh</Text>

        {isRegister && (
          <>
            <Text style={styles.label}>Họ và tên <Text style={styles.req}>*</Text></Text>
            <TextInput style={styles.input} placeholder="Nguyễn Văn An" value={name} onChangeText={setName} />
          </>
        )}
        <Text style={styles.label}>Email <Text style={styles.req}>*</Text></Text>
        <TextInput
          style={styles.input}
          placeholder="an.nguyen@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />
        <Text style={styles.label}>Mật khẩu <Text style={styles.req}>*</Text></Text>
        <TextInput style={styles.input} placeholder="••••••••" secureTextEntry value={password} onChangeText={setPassword} />

        {isRegister && (
          <>
            <Text style={styles.label}>Chọn vai trò của bạn <Text style={styles.req}>*</Text></Text>
            <View style={styles.roleRow}>
              {([
                ['OWNER', 'home', 'Chủ nhà', 'Theo dõi tiến độ'],
                ['MAIN_CONTRACTOR', 'tool', 'Nhà thầu', 'Quản lý dự án'],
              ] as const).map(([value, icon, title, hint]) => {
                const active = role === value;
                return (
                  <TouchableOpacity
                    key={value}
                    style={[styles.roleCard, active && styles.roleCardActive]}
                    onPress={() => setRole(value)}
                  >
                    <Feather name={icon} size={22} color={active ? colors.primary : colors.textMuted} />
                    <Text style={[styles.roleTitle, active && styles.roleTitleActive]}>{title}</Text>
                    <Text style={styles.roleHint}>{hint}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {showReferral ? (
              <TextInput
                style={styles.input}
                placeholder="Mã giới thiệu"
                autoCapitalize="none"
                value={referralCode}
                onChangeText={setReferralCode}
              />
            ) : (
              <TouchableOpacity onPress={() => setShowReferral(true)}>
                <Text style={styles.referralToggle}>+ Có mã giới thiệu?</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        <TouchableOpacity
          style={[styles.button, (!canSubmit || loading) && { opacity: 0.6 }]}
          disabled={!canSubmit || loading}
          onPress={submit}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>{isRegister ? 'Đăng ký tài khoản →' : 'Đăng nhập →'}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setIsRegister((v) => !v)}>
          <Text style={styles.link}>
            {isRegister ? (
              <>Đã có tài khoản? <Text style={styles.linkStrong}>Đăng nhập</Text></>
            ) : (
              <>Chưa có tài khoản? <Text style={styles.linkStrong}>Đăng ký</Text></>
            )}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.replace('/login')}>
          <Text style={styles.phoneLink}>← Dùng số điện thoại</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  logoBox: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  logo: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
  tagline: { textAlign: 'center', color: colors.textMuted, fontSize: 13, marginTop: 4, marginBottom: 24 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  req: { color: colors.danger },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#E5E5E5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    marginBottom: 14,
  },
  roleRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  roleCard: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#E5E5E5',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
  },
  roleCardActive: { borderWidth: 2, borderColor: '#22C55E', backgroundColor: colors.primaryLight },
  roleTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  roleTitleActive: { color: colors.primary },
  roleHint: { fontSize: 11, color: colors.textMuted },
  referralToggle: { color: colors.textMuted, fontSize: 13, marginBottom: 12, textAlign: 'center' },
  button: { backgroundColor: colors.primary, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 4 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  link: { color: colors.textMuted, textAlign: 'center', marginTop: 16, fontSize: 13 },
  linkStrong: { color: colors.primary, fontWeight: '700' },
  phoneLink: { color: colors.textMuted, textAlign: 'center', marginTop: 14, fontSize: 12 },
});
