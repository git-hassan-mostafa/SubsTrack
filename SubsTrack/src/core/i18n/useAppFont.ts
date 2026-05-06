import { Platform } from 'react-native';
import { useLanguageStore } from './languageStore';

/**
 * Returns the appropriate font family based on the active language.
 * For Arabic: uses Cairo (if bundled) or the best available system Arabic font.
 * For English: undefined (uses system default).
 *
 * To add Cairo font:
 *   1. Download Cairo-Regular.ttf, Cairo-Medium.ttf, Cairo-SemiBold.ttf, Cairo-Bold.ttf
 *      from https://fonts.google.com/specimen/Cairo
 *   2. Place them in assets/fonts/
 *   3. Load them in app/_layout.tsx with useFonts({ Cairo: require('../../assets/fonts/Cairo-Regular.ttf'), ... })
 *   4. Change ARABIC_FONT below from the system fallback to 'Cairo'
 */

const ARABIC_FONT_ANDROID = 'Cairo'; // falls back to system if not loaded
const ARABIC_FONT_IOS = 'Cairo';     // falls back to system if not loaded

export function useAppFont(): string | undefined {
  const { language } = useLanguageStore();
  if (language !== 'ar') return undefined;
  return Platform.OS === 'ios' ? ARABIC_FONT_IOS : ARABIC_FONT_ANDROID;
}

export function getArabicFontFamily(): string {
  return Platform.OS === 'ios' ? ARABIC_FONT_IOS : ARABIC_FONT_ANDROID;
}
