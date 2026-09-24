import type { UnpaidStartRule } from "@/src/core/types";

export const DEFAULT_UNPAID_START_RULE: UnpaidStartRule = "month_start";

export const TENANT_SETTING_KEYS = {
  unpaidStartRule: "UnpaidStartRule",
  displayCurrencyId: "DisplayCurrencyId",
} as const;
