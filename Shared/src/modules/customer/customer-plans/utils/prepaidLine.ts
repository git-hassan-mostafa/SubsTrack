import type { CustomerPlan, PlanUsage } from "@shared/core/types";

// A prepaid month is a calendar month, so a prepaid line starts on the 1st.
export function prepaidStartDate(startDate: string): string {
  return `${startDate.slice(0, 7)}-01`;
}

export function withPrepaidStart<T extends { prepaid: boolean; startDate: string }>(line: T): T {
  return line.prepaid ? { ...line, startDate: prepaidStartDate(line.startDate) } : line;
}

// A usage month is billed after it is used, so a meter line is never prepaid.
export function canBePrepaid(usage: PlanUsage | null | undefined): boolean {
  return !usage;
}

// set_plan_prepaid() applied to the lines already loaded.
export function withPlanPrepaid(
  lines: CustomerPlan[],
  planId: string,
  prepaid: boolean,
): CustomerPlan[] {
  return lines.map((line) =>
    line.planId === planId ? withPrepaidStart({ ...line, prepaid }) : line,
  );
}
