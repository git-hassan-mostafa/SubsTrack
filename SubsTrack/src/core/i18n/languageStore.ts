import AsyncStorage from "@react-native-async-storage/async-storage";
import i18n from "i18next";
import { I18nManager } from "react-native";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  PERSIST_KEY,
  RTL_LANGUAGES,
  SUPPORTED_LANGUAGES,
  reloadApp,
  type SupportedLanguage,
} from "./index";

interface LanguageState {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => Promise<void>;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: "en",

      setLanguage: async (lang) => {
        const isRTL = (RTL_LANGUAGES as readonly string[]).includes(lang);

        await i18n.changeLanguage(lang);
        I18nManager.allowRTL(isRTL);
        I18nManager.forceRTL(isRTL);
        set({ language: lang });

        // Persist before reload so the value is read on next boot
        await AsyncStorage.setItem(
          PERSIST_KEY,
          JSON.stringify({ state: { language: lang }, version: 0 }),
        );

        await reloadApp();
      },
    }),
    {
      name: PERSIST_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ language: state.language }),
    },
  ),
);

export { SUPPORTED_LANGUAGES };
export type { SupportedLanguage };
