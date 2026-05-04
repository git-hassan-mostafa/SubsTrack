import AsyncStorage from "@react-native-async-storage/async-storage";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { I18nManager } from "react-native";
import { getLocales } from "expo-localization";
import ar from "./locales/ar.json";
import en from "./locales/en.json";

export const SUPPORTED_LANGUAGES = ["en", "ar"] as const;
export const RTL_LANGUAGES = ["ar"] as const;
export const FALLBACK_LANGUAGE = "en" as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const PERSIST_KEY = "language-store";

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
  I18nManager.allowRTL(isRTL);
  I18nManager.forceRTL(isRTL);

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
