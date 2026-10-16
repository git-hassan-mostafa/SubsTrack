import type { TFunction } from "i18next";
import type { Currency, Plan, PlanPriceChange, PlanUsage } from "@shared/core/types";
import type { UsageMonthPrice } from "@shared/modules/customer/customer-payments/utils/usageBill";
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

export function usageBillingLabel(usage: PlanUsage, t: TFunction): string {
  return t("plans.by_usage_unit", { unit: usage.unitName });
}

export function planBillingLabel(plan: Pick<Plan, "durationMonths" | "usage">, t: TFunction): string {
  return plan.usage ? usageBillingLabel(plan.usage, t) : planDurationLabel(plan.durationMonths, t);
}

// A usage price stays in its own currency, never converted.
export function usageMonthPriceLabel(
  price: UsageMonthPrice,
  usage: PlanUsage,
  currencies: Currency[],
  t: TFunction,
): string {
  const currency = findCurrency(currencies, price.currencyId);
  return t("plans.usage_price_line", {
    feeName: usage.feeName,
    fee: formatMoney(price.fixedFee, currency, currency),
    unitPrice: formatMoney(price.unitPrice, currency, currency),
    unit: usage.unitName,
  });
}

// A plan-picker option's second line, priced in the display currency.
export function planPriceSublabel(
  plan: Pick<Plan, "price" | "currencyId" | "durationMonths" | "isCustomPrice"> & {
    usage?: PlanUsage | null;
  },
  currencies: Currency[],
  display: Currency | null,
  t: TFunction,
): string {
  if (plan.usage) return usageBillingLabel(plan.usage, t);
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
