import type { UnpaidStartRule, WhatsAppLanguage } from "@/src/core/types";

export const DEFAULT_UNPAID_START_RULE: UnpaidStartRule = "month_start";

export const DEFAULT_WHATSAPP_LANGUAGE: WhatsAppLanguage = "en";

export const TENANT_SETTING_KEYS = {
  unpaidStartRule: "UnpaidStartRule",
  displayCurrencyId: "DisplayCurrencyId",
  whatsAppLanguage: "WhatsAppLanguage",
} as const;
