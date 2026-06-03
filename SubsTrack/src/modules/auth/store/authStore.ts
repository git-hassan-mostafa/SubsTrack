import { create } from "zustand";
import type { AuthUser, TierPlan } from "@/src/core/types";
import { AuthService } from "../services/AuthService";
import { useCurrencyStore } from "@/src/modules/currencies/store/currencyStore";
import { useBranchStore } from "@/src/modules/branches/store/branchStore";
import { useSubscriptionStore } from "@/src/modules/subscription/store/subscriptionStore";

const authService = new AuthService();

// After a successful auth (login or session restore), prime supporting stores
// in parallel so all downstream pickers/formatters have data ready.
async function primePostAuth(user: AuthUser) {
  await Promise.all([
    useCurrencyStore.getState().fetchCurrencies(),
    useBranchStore.getState().fetchBranches(),
    useSubscriptionStore.getState().init(user.tenantId, user.tenant.tier ?? null),
  ]);
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
      await primePostAuth(result.user);
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
      if (result?.user) await primePostAuth(result.user);
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
    useSubscriptionStore.getState().reset();
    set({ user: null, tenantActive: true, loading: false, error: null });
  },

  setUserTier: (tier: TierPlan) =>
    set((state) =>
      state.user
        ? {
            user: {
              ...state.user,
              tenant: { ...state.user.tenant, tierId: tier.id, tier },
            },
          }
        : {},
    ),

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
  setUserTier: (tier: TierPlan) => void;
  clearError: () => void;
}