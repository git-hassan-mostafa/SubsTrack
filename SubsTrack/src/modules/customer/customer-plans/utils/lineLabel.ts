import type { CustomerPlan } from "@/src/core/types";

// A line may have no plan (plan_id NULL = custom amounts), so it needs a stand-in name.
export function lineLabel(
  line: Pick<CustomerPlan, "plan">,
  noPlan: string,
): string {
  return line.plan?.name || noPlan;
}
