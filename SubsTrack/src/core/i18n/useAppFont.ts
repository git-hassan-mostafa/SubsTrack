import { Platform } from 'react-native';
import { useLanguageStore } from './languageStore';


const ARABIC_FONT_ANDROID = 'Cairo';
const ARABIC_FONT_IOS = 'Cairo';

export function useAppFont(): string | undefined {
  const { language } = useLanguageStore();
  if (language !== 'ar') return undefined;
  return Platform.OS === 'ios' ? ARABIC_FONT_IOS : ARABIC_FONT_ANDROID;
}

export function getArabicFontFamily(): string {
  return Platform.OS === 'ios' ? ARABIC_FONT_IOS : ARABIC_FONT_ANDROID;
}
