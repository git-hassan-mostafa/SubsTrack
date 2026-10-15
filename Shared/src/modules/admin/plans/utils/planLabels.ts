import type { TFunction } from "i18next";
import type { Currency, Plan, PlanPriceChange } from "@shared/core/types";
import { billingMonthLabel } from "@shared/core/utils/billingMonth";
import { findCurrency, formatMoney } from "@shared/core/utils/currency";
import { formatDate } from "@shared/core/utils/date";

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

export function priceHistoryEffectiveLabel(
  item: PlanPriceChange,
  plan: Pick<Plan, "createdAt">,
  t: TFunction,
): string {
  const main = item.fromMonth
    ? t("plans.price_history_starts_from", {
        month: billingMonthLabel(item.fromMonth, true),
      })
    : t("plans.price_history_initial");
  const date = item.fromMonth ? item.createdAt : plan.createdAt || null;
  return date ? `${main} · ${formatDate(date)}` : main;
}
