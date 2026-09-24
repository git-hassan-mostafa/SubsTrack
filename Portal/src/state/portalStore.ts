import { create } from "zustand";
import {
  PortalError,
  portalRepository,
  type PortalErrorCode,
} from "../repository/PortalRepository";
import { buildPortalModel, type PortalModel } from "../services/PortalReadModel";

// Survives a refresh so a customer who reloads is not asked again, but dies
// with the tab: a shared or borrowed phone must not stay signed in.
const TOKEN_KEY = "portal_token";

// The whole link is this id, so a truncated or edited one must say so loudly:
// without it the password button simply did nothing and sent no request.
const CUSTOMER_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readToken(customerId: string): string | null {
  try {
    return sessionStorage.getItem(`${TOKEN_KEY}:${customerId}`);
  } catch {
    return null;
  }
}

function writeToken(customerId: string, token: string | null) {
  try {
    const key = `${TOKEN_KEY}:${customerId}`;
    if (token) sessionStorage.setItem(key, token);
    else sessionStorage.removeItem(key);
  } catch {
    // A private window can refuse storage; signing in again still works.
  }
}

interface PortalState {
  customerId: string | null;
  model: PortalModel | null;
  loading: boolean;
  signingIn: boolean;
  error: PortalErrorCode | null;
  year: number;
  init: (customerId: string) => Promise<void>;
  signIn: (password: string) => Promise<void>;
  signOut: () => void;
  setYear: (year: number) => void;
  clearError: () => void;
}

export const usePortalStore = create<PortalState>((set, get) => ({
  customerId: null,
  model: null,
  loading: false,
  signingIn: false,
  error: null,
  year: new Date().getFullYear(),

  async init(customerId) {
    if (!CUSTOMER_ID_REGEX.test(customerId)) {
      set({ customerId: null, error: "bad_link" });
      return;
    }
    set({ customerId, error: null });
    const token = readToken(customerId);
    if (!token) return;
    set({ loading: true });
    await load(customerId, token, set);
  },

  async signIn(password) {
    const { customerId, signingIn } = get();
    if (signingIn) return;
    if (!customerId) {
      set({ error: "bad_link" });
      return;
    }
    set({ signingIn: true, error: null });
    try {
      const token = await portalRepository.login(customerId, password);
      writeToken(customerId, token);
      set({ signingIn: false, loading: true });
      await load(customerId, token, set);
    } catch (err) {
      set({ signingIn: false, error: codeOf(err) });
    }
  },

  signOut() {
    const { customerId } = get();
    if (customerId) writeToken(customerId, null);
    set({ model: null, error: null, year: new Date().getFullYear() });
  },

  setYear(year) {
    set({ year });
  },

  clearError() {
    set({ error: null });
  },
}));

async function load(
  customerId: string,
  token: string,
  set: (partial: Partial<PortalState>) => void,
) {
  try {
    const payload = await portalRepository.fetchPayload(token);
    set({ model: buildPortalModel(payload), loading: false, error: null });
  } catch (err) {
    const code = codeOf(err);
    // An expired or rejected token is not an error to show - it just means
    // the password screen again.
    if (code === "bad_token" || code === "no_token") {
      writeToken(customerId, null);
      set({ model: null, loading: false, error: null });
      return;
    }
    set({ loading: false, error: code });
  }
}

function codeOf(err: unknown): PortalErrorCode {
  return err instanceof PortalError ? err.code : "server_error";
}
