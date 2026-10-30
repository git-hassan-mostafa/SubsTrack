import { createStore } from "../../../core/createStore.js";
import { connectAdmin, disconnectAdmin } from "../../../core/supabaseAdmin.js";
import { resetOptions } from "../../options/store/optionStore.js";
import { resetTenants } from "../../tenants/store/tenantStore.js";
import { keyProblem } from "../services/keyRules.js";
import { forgetSavedKey, readSavedKey, saveKey } from "../storage/keyStorage.js";

export const sessionStore = createStore({ connected: false, notice: null });

export function restoreSession() {
  const key = readSavedKey()?.trim() ?? "";
  if (!key) return;
  const problem = keyProblem(key);
  if (problem) {
    endSession(problem);
    return;
  }
  connectAdmin(key);
  sessionStore.setState({ connected: true, notice: null });
}

export function submitKey(rawKey) {
  const key = rawKey.trim();
  const problem = keyProblem(key);
  if (problem) {
    sessionStore.setState({ notice: problem });
    return;
  }
  saveKey(key);
  connectAdmin(key);
  sessionStore.setState({ connected: true, notice: null });
}

export function endSession(notice = null) {
  forgetSavedKey();
  disconnectAdmin();
  resetTenants();
  resetOptions();
  sessionStore.setState({ connected: false, notice });
}

export function clearNotice() {
  sessionStore.setState({ notice: null });
}
