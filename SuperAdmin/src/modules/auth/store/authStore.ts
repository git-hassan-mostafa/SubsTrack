import { create } from 'zustand';
import { supabase } from '@/src/shared/lib/supabase';

interface AuthState {
  ready: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  retry: () => Promise<void>;
}

async function autoLogin(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return;

  const email = process.env.EXPO_PUBLIC_AUTO_LOGIN_EMAIL!;
  const password = process.env.EXPO_PUBLIC_AUTO_LOGIN_PASSWORD!;

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
}

export const useAuthStore = create<AuthState>((set) => ({
  ready: false,
  error: null,

  initialize: async () => {
    set({ ready: false, error: null });
    try {
      await autoLogin();
      set({ ready: true, error: null });
    } catch (e) {
      set({ ready: true, error: (e as Error).message });
    }
  },

  retry: async () => {
    set({ ready: false, error: null });
    try {
      await autoLogin();
      set({ ready: true, error: null });
    } catch (e) {
      set({ ready: true, error: (e as Error).message });
    }
  },
}));
