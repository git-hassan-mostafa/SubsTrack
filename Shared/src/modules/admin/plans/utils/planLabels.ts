import type { TFunction } from "i18next";
import type { Currency, Plan } from "@shared/core/types";
import { findCurrency, formatMoney } from "@shared/core/utils/currency";

// A line's price is one payment, so every label names the span it covers.
export function linePeriodLabel(durationMonths: number, t: TFunction): string {
  return durationMonths > 1
    ? t("subscriptions.per_n_months", { count: durationMonths })
    : t("subscriptions.per_month");
}

export function pricePerPeriod(price: string, durationMonths: number, t: TFunction): string {
  return `${price} ${linePeriodLabel(durationMonths, t)}`;
}

export function planDurationLabel(durationMonths: number, t: TFunction): string {
  return durationMonths > 1
    ? t("plans.every_n_months", { count: durationMonths })
    : t("plans.monthly");
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
  return pricePerPeriod(price, plan.durationMonths, t);
}
