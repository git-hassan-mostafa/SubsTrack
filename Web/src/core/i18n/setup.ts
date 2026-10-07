import dayjs from "dayjs";
import "dayjs/locale/ar";
import type { ResourceLanguage } from "i18next";
import { initReactI18next } from "react-i18next";
import i18n, { FALLBACK_LANGUAGE, type SupportedLanguage } from "@shared/core/i18n";
import en from "@shared/core/i18n/locales/en.json";
import webEn from "./web.en.json";
import { applyPageDirection, saveLanguage, startLanguage } from "./language";

export const DAYJS_LOCALE: Record<SupportedLanguage, string> = { en: "en", ar: "ar-latn" };

const ENGLISH: ResourceLanguage = { translation: { ...en, web: webEn } };

async function loadArabic(): Promise<ResourceLanguage> {
  const [shared, web] = await Promise.all([
    import("@shared/core/i18n/locales/ar.json"),
    import("./web.ar.json"),
  ]);
  return { translation: { ...shared.default, web: web.default } };
}

// Arabic is fetched only when picked; English is every missing key's fallback
async function ensureLoaded(language: SupportedLanguage): Promise<void> {
  if (language === FALLBACK_LANGUAGE || i18n.hasResourceBundle(language, "translation")) return;
  const { translation } = await loadArabic();
  i18n.addResourceBundle(language, "translation", translation);
}

// dayjs "ar" writes ٠١٢ digits; every other date in the app writes 0-9.
function registerDayjsArabic(): void {
  const { preparse: _preparse, postformat: _postformat, ...arabic } = dayjs.Ls.ar as ILocale & {
    preparse?: unknown;
    postformat?: unknown;
  };
  dayjs.locale({ ...arabic, name: DAYJS_LOCALE.ar }, undefined, true);
}

export async function initWebI18n(): Promise<void> {
  registerDayjsArabic();
  const language = startLanguage();
  i18n.on("languageChanged", applyPageDirection);
  await i18n.use(initReactI18next).init({
    resources:
      language === FALLBACK_LANGUAGE ? { en: ENGLISH } : { en: ENGLISH, [language]: await loadArabic() },
    lng: language,
    fallbackLng: FALLBACK_LANGUAGE,
    interpolation: { escapeValue: false },
  });
}

export async function switchLanguage(language: SupportedLanguage): Promise<void> {
  saveLanguage(language);
  await ensureLoaded(language);
  await i18n.changeLanguage(language);
}
