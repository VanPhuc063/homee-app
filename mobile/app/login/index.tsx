import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
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

const OTP_LENGTH = 6;

/**
 * 6 ô riêng biệt nhưng thực chất chỉ là hiển thị — bàn phím thật gõ vào 1 TextInput ẩn (invisible,
 * phủ toàn bộ hàng ô) để tránh phải tự quản lý focus/backspace giữa 6 input riêng (dễ lỗi trên
 * RN, nhất là paste hoặc autofill OTP từ SMS). Chạm vào bất kỳ ô nào cũng focus vào input ẩn đó.
 */
function OtpInput({
  value,
  onChange,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (autoFocus) {
      const t = setTimeout(() => inputRef.current?.focus(), 250);
      return () => clearTimeout(t);
    }
  }, [autoFocus]);

  return (
    <TouchableOpacity
      activeOpacity={1}
      style={styles.otpRow}
      onPress={() => inputRef.current?.focus()}
    >
      {Array.from({ length: OTP_LENGTH }).map((_, i) => {
        const digit = value[i];
        const isCursor = i === value.length;
        return (
          <View key={i} style={[styles.otpBox, isCursor && styles.otpBoxActive]}>
            <Text style={styles.otpDigit}>{digit ?? ''}</Text>
          </View>
        );
      })}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(t) => onChange(t.replace(/[^0-9]/g, '').slice(0, OTP_LENGTH))}
        keyboardType="number-pad"
        maxLength={OTP_LENGTH}
        style={styles.otpHiddenInput}
        // Không dùng opacity 0 (iOS đôi khi bỏ qua input ẩn hoàn toàn) — để 1px là đủ vô hình.
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
      />
    </TouchableOpacity>
  );
}

// Đăng nhập/đăng ký chính: SĐT + OTP (gửi qua Zalo, không được thì SMS) — thợ/đội trưởng ít dùng
// email. Email + mật khẩu là lựa chọn phụ (login/email.tsx).
export default function LoginPhone() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showReferral, setShowReferral] = useState(false);
  const [channel, setChannel] = useState<'ZALO' | 'SMS' | null>(null);
  const [role, setRole] = useState<'OWNER' | 'MAIN_CONTRACTOR'>('OWNER');
  const [referralCode, setReferralCode] = useState('');
  const setSession = useAuth((s) => s.setSession);
  const qc = useQueryClient();

  const requestOtp = async () => {
    setLoading(true);
    try {
      const res = await api<{ channel: 'ZALO' | 'SMS' | null }>('/auth/otp/request', {
        method: 'POST',
        body: { phone, referralCode: referralCode.trim() || undefined },
        auth: false,
      });
      setChannel(res.channel);
      setOtpSent(true);
    } catch (e) {
      Alert.alert('Lỗi', (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const verify = async (otp: string) => {
    setLoading(true);
    try {
      const res = await api<{ user: AuthUser; accessToken: string; refreshToken: string }>(
        '/auth/otp/verify',
        { method: 'POST', body: { phone, code: otp }, auth: false },
      );
      // Xoá sạch cache cũ trước khi vào — tránh hiện nhầm dữ liệu (dự án, vai trò...) của
      // phiên đăng nhập trước đó nếu máy này từng test bằng số điện thoại khác.
      qc.clear();
      await setSession({ ...res.user, signupRole: role }, res.accessToken, res.refreshToken);
      registerPushToken();
    } catch (e) {
      Alert.alert('Lỗi', (e as Error).message);
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = (v: string) => {
    setCode(v);
    // Tự động xác nhận ngay khi gõ đủ 6 số — chuẩn UX của ô OTP dạng này, khỏi cần bấm thêm nút.
    if (v.length === OTP_LENGTH && !loading) verify(v);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.logoBox}>
        <Feather name="home" size={28} color="#fff" />
      </View>
      <Text style={styles.logo}>Nhật Ký Thi Công</Text>
      <Text style={styles.tagline}>Quản lý thi công thông minh</Text>

      {!otpSent ? (
        <>
          <Text style={styles.label}>Số điện thoại</Text>
          <TextInput
            style={styles.input}
            placeholder="0901 234 567"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
          <Text style={styles.label}>Bạn là</Text>
          <View style={styles.roleRow}>
            {([
              ['OWNER', 'home', 'Chủ nhà', 'Theo dõi tiến độ'],
              ['MAIN_CONTRACTOR', 'tool', 'Nhà thầu', 'Quản lý dự án'],
            ] as const).map(([value, icon, title, hint]) => (
              <TouchableOpacity
                key={value}
                style={[styles.roleCard, role === value && styles.roleCardActive]}
                onPress={() => setRole(value)}
              >
                <Feather name={icon} size={20} color={role === value ? colors.primary : colors.textMuted} />
                <Text style={[styles.roleTitle, role === value && { color: colors.primary }]}>{title}</Text>
                <Text style={styles.roleHint}>{hint}</Text>
              </TouchableOpacity>
            ))}
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
      ) : (
        <>
          <Text style={styles.otpLabel}>Mã OTP đã gửi {channel === 'ZALO' ? 'qua Zalo' : channel === 'SMS' ? 'qua SMS' : ''} tới</Text>
          <Text style={styles.phoneDisplay}>{phone}</Text>
          <OtpInput value={code} onChange={handleCodeChange} autoFocus />
        </>
      )}

      {!otpSent && (
        <TouchableOpacity
          style={[styles.button, loading && { opacity: 0.6 }]}
          disabled={loading || phone.length < 10}
          onPress={requestOtp}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Nhận mã qua Zalo</Text>
          )}
        </TouchableOpacity>
      )}

      {otpSent && loading && (
        <ActivityIndicator style={{ marginTop: 16 }} color={colors.primary} />
      )}

      {otpSent && (
        <TouchableOpacity
          onPress={() => {
            setOtpSent(false);
            setCode('');
          }}
        >
          <Text style={styles.link}>Đổi số điện thoại</Text>
        </TouchableOpacity>
      )}

      {!otpSent && (
        <TouchableOpacity onPress={() => router.push('/login/email')}>
          <Text style={styles.emailLink}>Dùng email & mật khẩu</Text>
        </TouchableOpacity>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  logoBox: { width: 56, height: 56, borderRadius: 14, backgroundColor: colors.primary, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  roleRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  roleCard: { flex: 1, borderWidth: 1.5, borderColor: '#E5E5E5', borderRadius: 10, padding: 12, alignItems: 'center', gap: 3 },
  roleCardActive: { borderWidth: 2, borderColor: '#22C55E', backgroundColor: colors.primaryLight },
  roleTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  roleHint: { fontSize: 11, color: colors.textMuted },
  emailLink: { textAlign: 'center', color: colors.textMuted, fontSize: 13, marginTop: 18 },
  backRow: {
    position: 'absolute',
    top: 56,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  backText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  logo: { fontSize: 40, fontWeight: '800', color: colors.primary, textAlign: 'center' },
  tagline: { textAlign: 'center', color: colors.textMuted, marginBottom: 32, marginTop: 8 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 16, color: colors.text,
    marginBottom: 12,
  },
  otpLabel: { textAlign: 'center', color: colors.textMuted, fontSize: 13 },
  phoneDisplay: {
    textAlign: 'center',
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    marginTop: 4,
    marginBottom: 18,
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  otpBox: {
    flex: 1,
    aspectRatio: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxActive: { borderColor: colors.primary },
  otpDigit: { fontSize: 22, fontWeight: '800', color: colors.text },
  otpHiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.01,
    fontSize: 1,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  link: { color: colors.primary, textAlign: 'center', marginTop: 16 },
  referralToggle: { color: colors.textMuted, fontSize: 13, marginBottom: 12, textAlign: 'center' },
});
