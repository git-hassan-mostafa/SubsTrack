import type { StateCreator } from 'zustand';
import i18n from '@/src/core/i18n';
import signupService from '@/src/modules/signup/services/SignupService';
import type { GlobalState } from '@/src/state/globalStore';

export interface SignupCredentials {
  username: string;
  tenantCode: string;
  password: string;
}

export interface SignupSlice {
  name: string;
  tenantCode: string;
  adminUserName: string;
  adminFullName: string;
  adminPassword: string;
  confirmPassword: string;

  loading: boolean;
  checkingCode: boolean;
  error: string | null;

  setWorkspace: (patch: Partial<{ name: string; tenantCode: string }>) => void;
  setAccount: (
    patch: Partial<{
      adminUserName: string;
      adminFullName: string;
      adminPassword: string;
      confirmPassword: string;
    }>,
  ) => void;
  validateAndCheckCode: () => Promise<boolean>;
  submit: () => Promise<SignupCredentials | null>;
  clearError: () => void;
  reset: () => void;
}

const INITIAL = {
  name: '',
  tenantCode: '',
  adminUserName: '',
  adminFullName: '',
  adminPassword: '',
  confirmPassword: '',
  loading: false,
  checkingCode: false,
  error: null,
};

export const createSignupSlice: StateCreator<
  GlobalState,
  [['zustand/immer', never]],
  [],
  SignupSlice
> = (set, get) => ({
  ...INITIAL,

  setWorkspace: (patch) =>
    set((state) => {
      Object.assign(state.signup, patch);
      state.signup.error = null;
    }),

  setAccount: (patch) =>
    set((state) => {
      Object.assign(state.signup, patch);
      state.signup.error = null;
    }),

  validateAndCheckCode: async () => {
    if (get().signup.checkingCode) return false;
    set((state) => {
      state.signup.checkingCode = true;
      state.signup.error = null;
    });
    try {
      const { name, tenantCode } = get().signup;
      signupService.validateWorkspace({ name, tenantCode });
      const available = await signupService.checkTenantCodeAvailable(tenantCode);
      if (!available) {
        set((state) => {
          state.signup.error = i18n.t('signup.errors.tenant_code_taken');
          state.signup.checkingCode = false;
        });
        return false;
      }
      set((state) => {
        state.signup.checkingCode = false;
      });
      return true;
    } catch (e) {
      set((state) => {
        state.signup.error = (e as Error).message;
        state.signup.checkingCode = false;
      });
      return false;
    }
  },

  submit: async () => {
    if (get().signup.loading) return null;
    set((state) => {
      state.signup.loading = true;
      state.signup.error = null;
    });
    try {
      const s = get().signup;
      await signupService.createTenant(
        { name: s.name, tenantCode: s.tenantCode },
        {
          adminUserName: s.adminUserName,
          adminFullName: s.adminFullName,
          adminPassword: s.adminPassword,
          confirmPassword: s.confirmPassword,
        },
      );
      const credentials: SignupCredentials = {
        username: s.adminUserName.trim().toLowerCase(),
        tenantCode: s.tenantCode.trim().toLowerCase(),
        password: s.adminPassword,
      };
      set((state) => {
        state.signup.loading = false;
      });
      return credentials;
    } catch (e) {
      const err = e as Error & { code?: string };
      const message =
        err.code === 'tenant_code_taken'
          ? i18n.t('signup.errors.tenant_code_taken')
          : err.message;
      set((state) => {
        state.signup.error = message;
        state.signup.loading = false;
      });
      return null;
    }
  },

  clearError: () =>
    set((state) => {
      state.signup.error = null;
    }),

  reset: () =>
    set((state) => {
      Object.assign(state.signup, INITIAL);
    }),
});
