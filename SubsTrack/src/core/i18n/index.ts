import AsyncStorage from "@react-native-async-storage/async-storage";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import {
  DevSettings,
  I18nManager,
  NativeModules,
  Platform,
} from "react-native";
import { getLocales } from "expo-localization";
import ar from "./locales/ar.json";
import en from "./locales/en.json";

export const SUPPORTED_LANGUAGES = ["en", "ar"] as const;
export const RTL_LANGUAGES = ["ar"] as const;
export const FALLBACK_LANGUAGE = "en" as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const PERSIST_KEY = "language-store";

export async function reloadApp(): Promise<void> {
  try {
    const Updates = await import("expo-updates");
    await Updates.reloadAsync();
    return;
  } catch {
    // expo-updates not available (e.g. Expo Go) — fall through
  }

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
    } catch {
      // ignore
    }
  }

  if (typeof window !== "undefined" && typeof window.location !== "undefined") {
    window.location.reload();
  }
}

function getDeviceLanguage(): SupportedLanguage {
  const locales = getLocales();
  const code = locales[0]?.languageCode ?? FALLBACK_LANGUAGE;
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(code)
    ? (code as SupportedLanguage)
    : FALLBACK_LANGUAGE;
}

export async function initI18n(): Promise<void> {
  let language: SupportedLanguage = getDeviceLanguage();

  try {
    const raw = await AsyncStorage.getItem(PERSIST_KEY);
    if (raw) {
      const persisted = JSON.parse(raw);
      const saved = persisted?.state?.language;
      if (saved && (SUPPORTED_LANGUAGES as readonly string[]).includes(saved)) {
        language = saved as SupportedLanguage;
      }
    }
  } catch {
    // keep device language on any storage error
  }

  const isRTL = (RTL_LANGUAGES as readonly string[]).includes(language);
  const rtlMismatch = I18nManager.isRTL !== isRTL;

  I18nManager.allowRTL(isRTL);
  I18nManager.forceRTL(isRTL);

  if (rtlMismatch && Platform.OS !== "web") {
    await reloadApp();
    return;
  }

  if (!i18n.isInitialized) {
    await i18n.use(initReactI18next).init({
      lng: language,
      fallbackLng: FALLBACK_LANGUAGE,
      resources: {
        en: { translation: en },
        ar: { translation: ar },
      },
      interpolation: { escapeValue: false },
    });
  } else {
    await i18n.changeLanguage(language);
  }
}

export default i18n;
