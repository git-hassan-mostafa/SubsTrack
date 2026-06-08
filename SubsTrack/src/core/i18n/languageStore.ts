import i18n from "i18next";
import { I18nManager } from "react-native";
import { getLocales } from "expo-localization";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  languagePersistStorage,
  setLanguageStore,
  STORAGE_KEYS,
} from "@/src/shared/lib/storage";
import {
  RTL_LANGUAGES,
  SUPPORTED_LANGUAGES,
  FALLBACK_LANGUAGE,
  reloadApp,
  type SupportedLanguage,
} from "./index";

function getDeviceLanguage(): SupportedLanguage {
  const locales = getLocales();
  const code = locales[0]?.languageCode ?? FALLBACK_LANGUAGE;
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(code)
    ? (code as SupportedLanguage)
    : FALLBACK_LANGUAGE;
}

interface LanguageState {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => Promise<void>;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: getDeviceLanguage(),

      setLanguage: async (lang) => {
        const isRTL = (RTL_LANGUAGES as readonly string[]).includes(lang);

        await i18n.changeLanguage(lang);
        I18nManager.allowRTL(isRTL);
        I18nManager.forceRTL(isRTL);
        set({ language: lang });

        // Persist before reload so the value is read on next boot
        await setLanguageStore(
          JSON.stringify({ state: { language: lang }, version: 0 }),
        );

        await reloadApp();
      },
    }),
    {
      name: STORAGE_KEYS.LANGUAGE_STORE,
      storage: createJSONStorage(() => languagePersistStorage),
      partialize: (state) => ({ language: state.language }),
    },
  ),
);

export { SUPPORTED_LANGUAGES };
export type { SupportedLanguage };
