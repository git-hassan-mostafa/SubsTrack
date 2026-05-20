import { create } from "zustand";
import type { AuthUser } from "@/src/core/types";
import { AuthService } from "../services/AuthService";
import { useCurrencyStore } from "@/src/modules/currencies/store/currencyStore";

const authService = new AuthService();

// After a successful auth (login or session restore), prime the currency
// store so all downstream CurrencyInputs and formatters have data ready.
async function primeCurrencies() {
  await useCurrencyStore.getState().fetchCurrencies();
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  tenantActive: true,
  loading: true, // starts true — app waits for restoreSession before routing
  error: null,

  login: async (username, tenantName, password) => {
    set({ loading: true, error: null });
    try {
      const result = await authService.login(username, tenantName, password);
      set({
        user: result.user,
        tenantActive: result.tenantActive,
        loading: false,
      });
      await primeCurrencies();
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  restoreSession: async () => {
    try {
      const result = await authService.restoreSession();
      set({
        user: result?.user ?? null,
        tenantActive: result?.tenantActive ?? true,
        loading: false,
      });
      if (result?.user) await primeCurrencies();
    } catch {
      set({ user: null, tenantActive: true, loading: false });
    }
  },

  logout: async () => {
    try {
      await authService.logout();
    } catch {
      // ignore logout errors — clear state regardless
    }
    useCurrencyStore.getState().reset();
    set({ user: null, tenantActive: true, loading: false, error: null });
  },

  clearError: () => set({ error: null }),
}));

interface AuthState {
  user: AuthUser | null;
  tenantActive: boolean;
  loading: boolean;
  error: string | null;
  login: (
    username: string,
    tenantName: string,
    password: string,
  ) => Promise<void>;
  restoreSession: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}