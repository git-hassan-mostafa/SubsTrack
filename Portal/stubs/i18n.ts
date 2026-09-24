import i18n from "i18next";
import { initReactI18next } from "react-i18next";
// Imported for their NAMED members, not as whole files: a default import inlines
// all ~180 KB of en.json + ar.json, most of it staff wording a customer should
// never receive. Named imports let the bundler keep only these three.
import {
  months as enMonths,
  months_long as enMonthsLong,
  debts as enDebts,
} from "../../SubsTrack/src/core/i18n/locales/en.json";
import {
  months as arMonths,
  months_long as arMonthsLong,
  debts as arDebts,
} from "../../SubsTrack/src/core/i18n/locales/ar.json";
import portalEn from "../src/core/i18n/portal.en.json";
import portalAr from "../src/core/i18n/portal.ar.json";

// Stands in for @/src/core/i18n, which pulls expo-localization and AsyncStorage.
// It is a REAL i18next instance rather than a key echo, because the pure code
// the portal imports (billingMonthLabel, chargeLabel) renders user-facing text
// through it. It loads SubsTrack's own locale files so month names and bill
// labels read identically to the staff app instead of being copied.

export const SUPPORTED_LANGUAGES = ["en", "ar"] as const;
export const RTL_LANGUAGES = ["ar"] as const;
export const FALLBACK_LANGUAGE = "en" as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export function isRtl(language: string): boolean {
  return (RTL_LANGUAGES as readonly string[]).includes(language);
}

// The only namespaces the imported pure code can reach: billingMonthLabel reads
// months / months_long, and chargeLabel reads debts.
i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: {
        months: enMonths,
        months_long: enMonthsLong,
        debts: enDebts,
        portal: portalEn,
      },
    },
    ar: {
      translation: {
        months: arMonths,
        months_long: arMonthsLong,
        debts: arDebts,
        portal: portalAr,
      },
    },
  },
  lng: FALLBACK_LANGUAGE,
  fallbackLng: FALLBACK_LANGUAGE,
  interpolation: { escapeValue: false },
});

export default i18n;
