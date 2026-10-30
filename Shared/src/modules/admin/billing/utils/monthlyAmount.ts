import {
  FREE_PLAN_LINES,
  type TenantPricing,
} from "@shared/modules/admin/billing/utils/types";

// No i18n imports here: SuperAdminWeb bundles this file (#149j).
export function isFreeTierOf(pricing: TenantPricing): boolean {
  return pricing.pricingModel === "per_line" && pricing.planAllowance <= FREE_PLAN_LINES;
}

// Allowed lines, never active ones.
export function monthlyAmountUsdOf(pricing: TenantPricing): number {
  if (pricing.pricingModel !== "per_line") {
    return Math.round((pricing.fixedPriceUsd ?? 0) * 100) / 100;
  }
  if (isFreeTierOf(pricing)) return 0;
  return Math.round(pricing.planAllowance * pricing.pricePerPlanUsd * 100) / 100;
}
