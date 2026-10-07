import {
  FALLBACK_LANGUAGE,
  isRtlLanguage,
  isSupportedLanguage,
  type SupportedLanguage,
} from "@shared/core/i18n";

const LANGUAGE_STORAGE_KEY = "web-language";

function savedLanguage(): string | null {
  try {
    return window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch {
    return null;
  }
}

// saved choice, else the browser's language (the phone uses the device's)
export function startLanguage(): SupportedLanguage {
  const saved = savedLanguage();
  if (isSupportedLanguage(saved)) return saved;
  const browser = navigator.language.split("-")[0];
  return isSupportedLanguage(browser) ? browser : FALLBACK_LANGUAGE;
}

export function saveLanguage(language: SupportedLanguage): void {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    return;
  }
}

export function currentLanguage(language: string): SupportedLanguage {
  return isSupportedLanguage(language) ? language : FALLBACK_LANGUAGE;
}

// A web page flips right-to-left with one attribute; the phone has to restart.
export function applyPageDirection(language: string): void {
  document.documentElement.lang = language;
  document.documentElement.dir = isRtlLanguage(language) ? "rtl" : "ltr";
}
