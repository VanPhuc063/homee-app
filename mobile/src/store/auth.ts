import * as SecureStore from '@/storage';
import { create } from 'zustand';

export interface AuthUser {
  id: string;
  // Email+mật khẩu là luồng chính giờ đây — SĐT+OTP vẫn là lối vào thay thế, nên 1 trong 2 có
  // thể vắng mặt tuỳ theo tài khoản đăng ký bằng cách nào.
  phone?: string;
  email?: string;
  name: string;
  /** Vai trò chọn lúc đăng ký (mockup 01) — chỉ lưu ở máy, dùng làm vai trò mặc định khi tạo dự án. */
  signupRole?: 'OWNER' | 'MAIN_CONTRACTOR';
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  hydrated: boolean;
  /** true ngay sau khi đăng ký mới — AuthGate đưa vào /onboarding (mockup 02–03) thay vì /. */
  justRegistered: boolean;
  setJustRegistered: (v: boolean) => void;
  setSession: (user: AuthUser, accessToken: string, refreshToken: string) => Promise<void>;
  setAccessToken: (token: string) => void;
  updateUser: (patch: Partial<AuthUser>) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
}

const KEY = 'homeee.session';

export const useAuth = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  hydrated: false,
  justRegistered: false,
  setJustRegistered: (v) => set({ justRegistered: v }),

  setSession: async (user, accessToken, refreshToken) => {
    set({ user, accessToken, refreshToken });
    await SecureStore.setItemAsync(KEY, JSON.stringify({ user, accessToken, refreshToken }));
  },

  setAccessToken: (token) => set({ accessToken: token }),

  updateUser: async (patch) => {
    let next: AuthUser | null = null;
    set((s) => {
      if (!s.user) return s;
      next = { ...s.user, ...patch };
      return { user: next };
    });
    if (!next) return;
    const raw = await SecureStore.getItemAsync(KEY);
    const session = raw ? JSON.parse(raw) : {};
    await SecureStore.setItemAsync(KEY, JSON.stringify({ ...session, user: next }));
  },

  logout: async () => {
    set({ user: null, accessToken: null, refreshToken: null });
    await SecureStore.deleteItemAsync(KEY);
  },

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        set({ user: s.user, accessToken: s.accessToken, refreshToken: s.refreshToken });
      }
    } finally {
      set({ hydrated: true });
    }
  },
}));
