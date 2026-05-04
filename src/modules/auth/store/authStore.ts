import { create } from 'zustand';
import type { AuthUser } from '@/src/core/types';
import { AuthService } from '../services/AuthService';

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  login: (username: string, tenantId: string, password: string) => Promise<void>;
  restoreSession: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const authService = new AuthService();

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true, // starts true — app waits for restoreSession before routing
  error: null,

  login: async (username, tenantId, password) => {
    set({ loading: true, error: null });
    try {
      const user = await authService.login(username, tenantId, password);
      set({ user, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  restoreSession: async () => {
    try {
      const user = await authService.restoreSession();
      set({ user, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },

  logout: async () => {
    try {
      await authService.logout();
    } catch {
      // ignore logout errors — clear state regardless
    }
    set({ user: null, loading: false, error: null });
  },

  clearError: () => set({ error: null }),
}));
