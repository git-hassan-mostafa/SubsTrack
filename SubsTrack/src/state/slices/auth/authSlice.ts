import type { StateCreator } from "zustand";
import type { AuthUser } from "@/src/core/types";
import { authService } from "@/src/modules/authentication/auth";
import { reconcileBranchPref } from "@/src/shared/lib/branchFilter";
import type { GlobalState } from "@/src/state/globalStore";

export interface AuthSlice {
  user: AuthUser | null;
  tenantActive: boolean;
  loading: boolean;
  error: string | null;
  login: (
    username: string,
    tenantCode: string,
    password: string,
  ) => Promise<void>;
  restoreSession: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

// Branches first and alone — the branch filter is reconciled off them (#157).
async function primePostAuth(
  get: () => GlobalState,
  user: AuthUser,
): Promise<void> {
  await get().branches.fetchBranches();
  reconcileBranchPref(get().branches.items);
  await Promise.all([
    get().currencies.fetchCurrencies(),
    get().billing.init(user.tenantId),
    get().options.fetchOptions(),
    get().tenantSettings.fetchSettings(),
  ]);
}

export const createAuthSlice: StateCreator<
  GlobalState,
  [["zustand/immer", never]],
  [],
  AuthSlice
> = (set, get) => ({
  user: null,
  tenantActive: true,
  loading: true,
  error: null,

  login: async (username, tenantCode, password) => {
    set((state) => {
      state.auth.error = null;
    });
    try {
      const result = await authService.login(username, tenantCode, password);
      set((state) => {
        state.auth.user = result.user;
        state.auth.tenantActive = result.tenantActive;
        state.auth.loading = false;
      });
      await primePostAuth(get, result.user);
    } catch (e) {
      set((state) => {
        state.auth.error = (e as Error).message;
        state.auth.loading = false;
      });
    }
  },

  restoreSession: async () => {
    try {
      const result = await authService.restoreSession();
      set((state) => {
        state.auth.user = result?.user ?? null;
        state.auth.tenantActive = result?.tenantActive ?? true;
        state.auth.loading = false;
      });
      if (result?.user) await primePostAuth(get, result.user);
    } catch {
      set((state) => {
        state.auth.user = null;
        state.auth.tenantActive = true;
        state.auth.loading = false;
      });
    }
  },

  logout: async () => {
    try {
      await authService.logout();
    } catch {}
    set((state) => {
      state.auth.user = null;
      state.auth.tenantActive = true;
      state.auth.loading = false;
      state.auth.error = null;
    });
  },

  clearError: () =>
    set((state) => {
      state.auth.error = null;
    }),
});
