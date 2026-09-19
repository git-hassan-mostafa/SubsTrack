import type { StateCreator } from "zustand";
import type { AuthUser } from "@/src/core/types";
import { authService } from "@/src/modules/authentication/auth";
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

// After a successful auth (login or session restore), prime supporting slices
// in parallel so all downstream pickers/formatters have data ready.
async function primePostAuth(
  get: () => GlobalState,
  user: AuthUser,
): Promise<void> {
  await Promise.all([
    get().currencies.fetchCurrencies(),
    get().branches.fetchBranches(),
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
    get().billing.reset();
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
