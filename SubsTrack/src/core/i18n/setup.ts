import { initReactI18next } from "react-i18next";
import {
  DevSettings,
  I18nManager,
  NativeModules,
  Platform,
} from "react-native";
import { getLocales } from "expo-localization";
import i18n, {
  FALLBACK_LANGUAGE,
  isRtlLanguage,
  isSupportedLanguage,
  type SupportedLanguage,
} from "@shared/core/i18n";
import { resources } from "@shared/core/i18n/resources";
import {
  clearRTLReloadCount,
  getLanguageStore,
  getRTLReloadCount,
  incrementRTLReloadCount,
  MAX_RTL_RELOADS,
} from "@/src/shared/lib/storage";

export async function reloadApp(): Promise<void> {
  try {
    const Updates = await import("expo-updates");
    await Updates.reloadAsync();
    return;
  } catch {}

  if (Platform.OS !== "web") {
    try {
      if (typeof DevSettings?.reload === "function") {
        DevSettings.reload();
        return;
      }
      const DevMenu = (NativeModules as any).DevMenu;
      if (DevMenu?.reload) {
        DevMenu.reload();
        return;
      }
    } catch {}
  }

  if (typeof window !== "undefined" && typeof window.location !== "undefined") {
    window.location.reload();
  }
}

export function getDeviceLanguage(): SupportedLanguage {
  const locales = getLocales();
  const code = locales[0]?.languageCode ?? FALLBACK_LANGUAGE;
  return isSupportedLanguage(code) ? code : FALLBACK_LANGUAGE;
}

export async function initI18n(): Promise<void> {
  let language: SupportedLanguage = getDeviceLanguage();

  try {
    const raw = await getLanguageStore();
    if (raw) {
      const persisted = JSON.parse(raw);
      const saved = persisted?.state?.language;
      if (isSupportedLanguage(saved)) language = saved;
    }
  } catch {}

  const isRTL = isRtlLanguage(language);

  if (Platform.OS !== "web") {
    const rtlMismatch = I18nManager.isRTL !== isRTL;
    I18nManager.allowRTL(isRTL);
    I18nManager.forceRTL(isRTL);
    if (rtlMismatch) {
      const count = await getRTLReloadCount();
      if (count < MAX_RTL_RELOADS) {
        await incrementRTLReloadCount();
        await reloadApp();
        return;
      }
    }
  }

  await clearRTLReloadCount();

  if (!i18n.isInitialized) {
    await i18n.use(initReactI18next).init({
      lng: language,
      fallbackLng: FALLBACK_LANGUAGE,
      resources,
      interpolation: { escapeValue: false },
    });
  } else {
    await i18n.changeLanguage(language);
  }
}
