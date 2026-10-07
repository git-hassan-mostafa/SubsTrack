import i18n from "i18next";

export const SUPPORTED_LANGUAGES = ["en", "ar"] as const;
export const RTL_LANGUAGES = ["ar"] as const;
export const FALLBACK_LANGUAGE = "en" as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// each in its own words: findable by someone who can't read the current one
export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  en: "English",
  ar: "العربية",
};

export function isSupportedLanguage(code: unknown): code is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly unknown[]).includes(code);
}

export function isRtlLanguage(language: string): boolean {
  return (RTL_LANGUAGES as readonly string[]).includes(language);
}

// The one i18next instance; each app runs its own init on it at startup.
export default i18n;
