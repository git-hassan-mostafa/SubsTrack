import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import i18n from '@/src/core/i18n';
import { signupService } from '@/src/modules/authentication/signup';

// A MODULE store, not a global slice: only the signup flow reads it, and no
// slice reads it back. Reads nothing else — signup runs before there is a session.
// See CLAUDE.md → State Management.

export interface SignupCredentials {
  username: string;
  tenantCode: string;
  password: string;
}

export interface SignupState {
  name: string;
  tenantCode: string;
  adminUserName: string;
  adminFullName: string;
  adminPassword: string;
  confirmPassword: string;

  loading: boolean;
  checkingCode: boolean;
  error: string | null;

  setOrganization: (patch: Partial<{ name: string; tenantCode: string }>) => void;
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

export const useSignupStore = create<SignupState>()(
  immer((set, get) => ({
    ...INITIAL,

    setOrganization: (patch) =>
      set((state) => {
        Object.assign(state, patch);
        state.error = null;
      }),

    setAccount: (patch) =>
      set((state) => {
        Object.assign(state, patch);
        state.error = null;
      }),

    validateAndCheckCode: async () => {
      if (get().checkingCode) return false;
      set((state) => {
        state.checkingCode = true;
        state.error = null;
      });
      try {
        const { name, tenantCode } = get();
        signupService.validateOrganization({ name, tenantCode });
        const available = await signupService.checkTenantCodeAvailable(tenantCode);
        if (!available) {
          set((state) => {
            state.error = i18n.t('signup.errors.tenant_code_taken');
            state.checkingCode = false;
          });
          return false;
        }
        set((state) => {
          state.checkingCode = false;
        });
        return true;
      } catch (e) {
        set((state) => {
          state.error = (e as Error).message;
          state.checkingCode = false;
        });
        return false;
      }
    },

    submit: async () => {
      if (get().loading) return null;
      set((state) => {
        state.loading = true;
        state.error = null;
      });
      try {
        const s = get();
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
          state.loading = false;
        });
        return credentials;
      } catch (e) {
        const err = e as Error & { code?: string };
        const message =
          err.code === 'tenant_code_taken'
            ? i18n.t('signup.errors.tenant_code_taken')
            : err.message;
        set((state) => {
          state.error = message;
          state.loading = false;
        });
        return null;
      }
    },

    clearError: () =>
      set((state) => {
        state.error = null;
      }),

    reset: () =>
      set((state) => {
        Object.assign(state, INITIAL);
      }),
  })),
);
