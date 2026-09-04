import type { CustomerPlan, Plan } from "@/src/core/types";


/** Where a line's amount comes from. "typed" = nothing remembered, staff must enter it. */
export type LinePriceKind = "special" | "plan" | "typed";

export interface LinePrice {
  amount: number | null;
  currencyId: string | null;
  durationMonths: number;
  isFixed: boolean;
  kind: LinePriceKind;
}

/** Structural, so an unsaved editor ROW resolves the same way a saved line does. */
export type PricedLine = Pick<CustomerPlan, "customPrice" | "customCurrencyId"> & {
  plan?: Plan | null;
};

/** The effective price of one service line. */
export function resolveLinePrice(line: PricedLine): LinePrice {
  const plan = line.plan ?? null;
  const durationMonths = plan?.durationMonths ?? 1;

  if (line.customPrice != null) {
    return {
      amount: line.customPrice,
      currencyId: line.customCurrencyId,
      durationMonths,
      isFixed: true,
      kind: "special",
    };
  }

  if (plan && !plan.isCustomPrice && plan.price !== null) {
    return {
      amount: plan.price,
      currencyId: plan.currencyId,
      durationMonths,
      isFixed: true,
      kind: "plan",
    };
  }

  return { amount: null, currencyId: null, durationMonths, isFixed: false, kind: "typed" };
}
