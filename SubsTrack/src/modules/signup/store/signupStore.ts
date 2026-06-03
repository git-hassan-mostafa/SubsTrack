import { create } from "zustand";
import i18n from "@/src/core/i18n";
import { SignupService } from "../services/SignupService";

const signupService = new SignupService();

export interface SignupCredentials {
  username: string;
  tenantCode: string;
  password: string;
}

interface SignupState {
  // Form state shared across the two signup screens
  name: string;
  tenantCode: string;
  adminUserName: string;
  adminFullName: string;
  adminPassword: string;
  confirmPassword: string;

  // UI state
  loading: boolean;          // submitting createTenant
  checkingCode: boolean;     // checking tenant_code availability
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
  // Validates the workspace form, then pings the RPC. Returns true on success
  // (caller should navigate to the account screen). On failure sets `error`
  // and returns false.
  validateAndCheckCode: () => Promise<boolean>;
  // Validates + calls the edge function. On success returns credentials so
  // the screen can chain into authStore.login(). On failure sets `error`
  // and returns null.
  submit: () => Promise<SignupCredentials | null>;
  clearError: () => void;
  reset: () => void;
}

const INITIAL: Omit<
  SignupState,
  | "setWorkspace"
  | "setAccount"
  | "validateAndCheckCode"
  | "submit"
  | "clearError"
  | "reset"
> = {
  name: "",
  tenantCode: "",
  adminUserName: "",
  adminFullName: "",
  adminPassword: "",
  confirmPassword: "",
  loading: false,
  checkingCode: false,
  error: null,
};

export const useSignupStore = create<SignupState>((set, get) => ({
  ...INITIAL,

  setWorkspace: (patch) => set({ ...patch, error: null }),
  setAccount: (patch) => set({ ...patch, error: null }),

  validateAndCheckCode: async () => {
    if (get().checkingCode) return false;
    set({ checkingCode: true, error: null });
    try {
      const { name, tenantCode } = get();
      signupService.validateWorkspace({ name, tenantCode });
      const available = await signupService.checkTenantCodeAvailable(tenantCode);
      if (!available) {
        set({
          error: i18n.t("signup.errors.tenant_code_taken"),
          checkingCode: false,
        });
        return false;
      }
      set({ checkingCode: false });
      return true;
    } catch (e) {
      set({ error: (e as Error).message, checkingCode: false });
      return false;
    }
  },

  submit: async () => {
    if (get().loading) return null;
    set({ loading: true, error: null });
    try {
      const state = get();
      await signupService.createTenant(
        { name: state.name, tenantCode: state.tenantCode },
        {
          adminUserName: state.adminUserName,
          adminFullName: state.adminFullName,
          adminPassword: state.adminPassword,
          confirmPassword: state.confirmPassword,
        },
      );
      const credentials: SignupCredentials = {
        username: state.adminUserName.trim().toLowerCase(),
        tenantCode: state.tenantCode.trim().toLowerCase(),
        password: state.adminPassword,
      };
      set({ loading: false });
      return credentials;
    } catch (e) {
      const err = e as Error & { code?: string };
      // Server reports a known semantic error — translate it. Otherwise show
      // whatever the server/edge function returned verbatim.
      const message = err.code === "tenant_code_taken"
        ? i18n.t("signup.errors.tenant_code_taken")
        : err.message;
      set({ error: message, loading: false });
      return null;
    }
  },

  clearError: () => set({ error: null }),
  reset: () => set({ ...INITIAL }),
}));
