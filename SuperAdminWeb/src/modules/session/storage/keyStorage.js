const KEY_STORAGE = "sijil-superadmin.service-role-key";

export function readSavedKey() {
  try {
    return localStorage.getItem(KEY_STORAGE);
  } catch {
    return null;
  }
}

export function saveKey(key) {
  try {
    localStorage.setItem(KEY_STORAGE, key);
  } catch {
    return;
  }
}

export function forgetSavedKey() {
  try {
    localStorage.removeItem(KEY_STORAGE);
  } catch {
    return;
  }
}
