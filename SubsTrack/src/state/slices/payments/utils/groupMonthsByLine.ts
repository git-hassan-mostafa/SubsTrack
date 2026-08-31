import type { SetSkipInput } from "@/src/modules/customer/customer-payments";

/** The unskip guard is per line, so bucket the months it would touch. */
export function groupMonthsByLine(inputs: SetSkipInput[]): Map<string, string[]> {
  const byLine = new Map<string, string[]>();
  for (const i of inputs) {
    const list = byLine.get(i.customerPlanId);
    if (list) list.push(i.billingMonth);
    else byLine.set(i.customerPlanId, [i.billingMonth]);
  }
  return byLine;
}
