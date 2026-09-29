import { initReactI18next } from "react-i18next";
import i18n, { FALLBACK_LANGUAGE } from "@shared/core/i18n";
import en from "@shared/core/i18n/locales/en.json";
import webEn from "./web.en.json";

// English only until the Arabic + right-to-left phase (H1).
export async function initWebI18n(): Promise<void> {
  await i18n.use(initReactI18next).init({
    resources: { en: { translation: { ...en, web: webEn } } },
    lng: FALLBACK_LANGUAGE,
    fallbackLng: FALLBACK_LANGUAGE,
    interpolation: { escapeValue: false },
  });
}
