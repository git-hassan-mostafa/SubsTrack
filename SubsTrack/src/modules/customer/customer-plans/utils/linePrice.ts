import type { CustomerPlan, Plan } from "@/src/core/types";

// "What does this service line cost?" — the single answer, shared by the payment
// form, quick pay, bulk pay and every price label, so the rule exists exactly
// once. Nothing may read `plan.price` directly any more: a line can carry its own
// privately negotiated price (customer_plans.custom_price), and the amount and its
// currency must always travel together (the currency is what freezes
// payments.rate_per_usd_snapshot — gotcha #21).

/** Where a line's amount comes from. "typed" = nothing remembered, staff must enter it. */
export type LinePriceKind = "special" | "plan" | "typed";

export interface LinePrice {
  /** What one payment on this line costs. null only when kind === "typed". */
  amount: number | null;
  /** Currency of `amount`. null = USD. */
  currencyId: string | null;
  /**
   * Months one payment covers — the plan's bundle length, 1 without a plan.
   * A special price is the price of ONE payment, so it covers this same span:
   * "100 per 3 months", never 100 × 3.
   */
  durationMonths: number;
  /** true when the app may charge `amount` without asking (quick pay / bulk pay). */
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

  // A special price REPLACES the plan's price for the same span the plan bills:
  // on a 3-month plan it is "100 per 3 months", not 100 a month. So it carries
  // the plan's own durationMonths and multi-month lines are fully supported.
  if (line.customPrice !== null) {
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

  // Custom-price plan or no plan, and no special price: staff type the amount.
  return { amount: null, currencyId: null, durationMonths, isFixed: false, kind: "typed" };
}
