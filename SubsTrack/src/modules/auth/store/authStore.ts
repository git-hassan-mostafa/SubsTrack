import { create } from "zustand";
import type { AuthUser } from "@/src/core/types";
import { AuthService } from "../services/AuthService";
import { useCurrencyStore } from "@/src/modules/currencies/store/currencyStore";
import { useBranchStore } from "@/src/modules/branches/store/branchStore";
import { usePlanStore } from "@/src/modules/plans/store/planStore";
import { useUserStore } from "@/src/modules/users/store/userStore";
import { useCustomerStore } from "@/src/modules/customers/store/customerStore";
import { usePaymentStore } from "@/src/modules/customer-payments/store/paymentStore";
import { useDashboardStore } from "@/src/modules/dashboard/store/dashboardStore";

const authService = new AuthService();

// After a successful auth (login or session restore), prime supporting stores
// in parallel so all downstream pickers/formatters have data ready.
async function primePostAuth() {
  await Promise.all([
    useCurrencyStore.getState().fetchCurrencies(),
    useBranchStore.getState().fetchBranches(),
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
      await primePostAuth();
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
      if (result?.user) await primePostAuth();
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
    // Reset every domain store so a different user logging in on the same
    // device doesn't see the previous session's data (or have it leak into
    // queries that short-circuit on cached state).
    useCurrencyStore.getState().reset();
    useBranchStore.getState().reset();
    usePlanStore.getState().reset();
    useUserStore.getState().reset();
    useCustomerStore.getState().reset();
    usePaymentStore.getState().reset();
    useDashboardStore.getState().reset();
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