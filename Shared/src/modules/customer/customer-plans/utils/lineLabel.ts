import type { TFunction } from "i18next";
import type { Customer, CustomerPlan } from "@shared/core/types";
import { activeLines } from "@shared/modules/customer/customer-plans/utils/activeLines";

// A line may have no plan (plan_id NULL = custom amounts), so it needs a stand-in name.
export function lineLabel(
  line: Pick<CustomerPlan, "plan">,
  noPlan: string,
): string {
  return line.plan?.name || noPlan;
}

// One plan reads by name; several collapse to a count.
export function planSummary(
  customer: Pick<Customer, "customerPlans">,
  t: TFunction,
): string {
  const lines = activeLines(customer);
  if (lines.length === 0) return t("common.no_plan");
  if (lines.length === 1) return lineLabel(lines[0], t("common.no_plan"));
  return t("subscriptions.count_plans", { count: lines.length });
}
