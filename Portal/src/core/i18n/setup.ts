import { initReactI18next } from "react-i18next";
import i18n, { FALLBACK_LANGUAGE } from "@shared/core/i18n";
import {
  months as enMonths,
  months_long as enMonthsLong,
  debts as enDebts,
} from "@shared/core/i18n/locales/en.json";
import {
  months as arMonths,
  months_long as arMonthsLong,
  debts as arDebts,
} from "@shared/core/i18n/locales/ar.json";
import portalEn from "./portal.en.json";
import portalAr from "./portal.ar.json";

// Named imports only: a whole locale file would ship ~180 KB of staff wording.
function initPortalI18n(): void {
  void i18n.use(initReactI18next).init({
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
}

initPortalI18n();
