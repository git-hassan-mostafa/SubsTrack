import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from 'i18next';
import { DevSettings, I18nManager, NativeModules, Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { RTL_LANGUAGES, SUPPORTED_LANGUAGES, type SupportedLanguage } from './index';

const PERSIST_KEY = 'language-store';

interface LanguageState {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => Promise<void>;
}

async function reloadApp(): Promise<void> {
  // 1. Production / dev-client native: use expo-updates
  try {
    const Updates = await import('expo-updates');
    await Updates.reloadAsync();
    return;
  } catch {
    // expo-updates not available (e.g. Expo Go) — fall through
  }

  // 2. Native dev (Expo Go / Metro): use DevSettings
  if (Platform.OS !== 'web') {
    try {
      if (typeof DevSettings?.reload === 'function') {
        DevSettings.reload();
        return;
      }
      // Last-resort native reload through bridge
      const DevMenu = (NativeModules as any).DevMenu;
      if (DevMenu?.reload) {
        DevMenu.reload();
        return;
      }
    } catch {
      // ignore
    }
  }

  // 3. Web: reload the document
  if (typeof window !== 'undefined' && typeof window.location !== 'undefined') {
    window.location.reload();
  }
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
