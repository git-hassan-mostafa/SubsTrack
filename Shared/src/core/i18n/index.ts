import i18n from "i18next";

export const SUPPORTED_LANGUAGES = ["en", "ar"] as const;
export const RTL_LANGUAGES = ["ar"] as const;
export const FALLBACK_LANGUAGE = "en" as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// The one i18next instance; each app runs its own init on it at startup.
export default i18n;
