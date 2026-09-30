import type { TFunction } from "i18next";
import type { Currency, Plan } from "@shared/core/types";
import { findCurrency, formatMoney } from "@shared/core/utils/currency";

// A line's price is one payment, so every label names the span it covers.
export function linePeriodLabel(durationMonths: number, t: TFunction): string {
  return durationMonths > 1
    ? t("subscriptions.per_n_months", { count: durationMonths })
    : t("subscriptions.per_month");
}

// A plan-picker option's second line, priced in the display currency.
export function planPriceSublabel(
  plan: Pick<Plan, "price" | "currencyId" | "durationMonths" | "isCustomPrice">,
  currencies: Currency[],
  display: Currency | null,
  t: TFunction,
): string {
  if (plan.isCustomPrice) return t("common.custom_pricing");
  const price = formatMoney(plan.price ?? 0, findCurrency(currencies, plan.currencyId), display);
  const period =
    plan.durationMonths === 1
      ? t("plans.per_month")
      : t("plans.n_months", { count: plan.durationMonths });
  return `${price} / ${period}`;
}
