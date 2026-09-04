import AsyncStorage from "@react-native-async-storage/async-storage";

export const STORAGE_KEYS = {
  LANGUAGE_STORE: "language-store",
  RTL_RELOAD_COUNT: "rtl-reload-count",
  UI_PREF_STORE: "ui-pref-store",
};

export const MAX_RTL_RELOADS = 3;


export async function getLanguageStore(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEYS.LANGUAGE_STORE);
}

export async function setLanguageStore(value: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.LANGUAGE_STORE, value);
}

export const languagePersistStorage = {
  getItem: (_name: string) => AsyncStorage.getItem(STORAGE_KEYS.LANGUAGE_STORE),
  setItem: (_name: string, value: string) =>
    AsyncStorage.setItem(STORAGE_KEYS.LANGUAGE_STORE, value),
  removeItem: (_name: string) => AsyncStorage.removeItem(STORAGE_KEYS.LANGUAGE_STORE),
};


export async function getRTLReloadCount(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.RTL_RELOAD_COUNT);
    return raw ? parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

export async function incrementRTLReloadCount(): Promise<void> {
  try {
    const count = await getRTLReloadCount();
    await AsyncStorage.setItem(STORAGE_KEYS.RTL_RELOAD_COUNT, String(count + 1));
  } catch {
  }
}

export async function clearRTLReloadCount(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.RTL_RELOAD_COUNT);
  } catch {
  }
}


export const uiPrefPersistStorage = {
  getItem: (_name: string) => AsyncStorage.getItem(STORAGE_KEYS.UI_PREF_STORE),
  setItem: (_name: string, value: string) =>
    AsyncStorage.setItem(STORAGE_KEYS.UI_PREF_STORE, value),
  removeItem: (_name: string) => AsyncStorage.removeItem(STORAGE_KEYS.UI_PREF_STORE),
};


export { AsyncStorage as supabaseStorage };
