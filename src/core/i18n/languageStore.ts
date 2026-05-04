import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from 'i18next';
import { I18nManager } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { RTL_LANGUAGES, SUPPORTED_LANGUAGES, type SupportedLanguage } from './index';

const PERSIST_KEY = 'language-store';

interface LanguageState {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => Promise<void>;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: 'en',

      setLanguage: async (lang) => {
        const isRTL = (RTL_LANGUAGES as readonly string[]).includes(lang);

        await i18n.changeLanguage(lang);
        I18nManager.allowRTL(isRTL);
        I18nManager.forceRTL(isRTL);
        set({ language: lang });

        // Write directly so the value is persisted before the reload
        await AsyncStorage.setItem(
          PERSIST_KEY,
          JSON.stringify({ state: { language: lang }, version: 0 }),
        );

        try {
          const Updates = await import('expo-updates');
          await Updates.reloadAsync();
        } catch {
          // In development expo-updates.reloadAsync is unavailable; the language
          // change is still reflected via i18next but RTL requires a full restart.
        }
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
