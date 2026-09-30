import type { UnpaidStartRule } from "@shared/core/types";
import { DEFAULT_UNPAID_START_RULE } from "@shared/modules/admin/tenant-settings/utils/constants";

export const UNPAID_START_RULES: UnpaidStartRule[] = [
  "month_start",
  "customer_start_day",
];

// A missing or unknown stored value reads as the default rule.
export function parseUnpaidStartRule(
  value: string | null | undefined,
): UnpaidStartRule {
  const v = value?.trim() as UnpaidStartRule | undefined;
  return v && UNPAID_START_RULES.includes(v) ? v : DEFAULT_UNPAID_START_RULE;
}
