import type { CustomerRequest, PricingModel } from "@shared/core/types";
import { formatMoney } from "@shared/core/utils/currency";
import billingService from "@shared/modules/admin/billing/services/BillingService";
import {
  FREE_PLAN_LINES,
  type QuotaPair,
  type TenantPricing,
} from "@shared/modules/admin/billing/utils/types";

const NEAR_FULL_SHARE = 0.8;

export type UsageLevel = "full" | "near" | "ok";

export interface Usage {
  level: UsageLevel;
  percent: number;
  remaining: number;
  full: boolean;
}

// Amber from 80%, red once full: the admin sees the wall before hitting it.
export function usageOf(used: number, total: number): Usage {
  const full = used >= total;
  const level: UsageLevel =
    total === 0 || full ? "full" : used / total >= NEAR_FULL_SHARE ? "near" : "ok";
  return {
    level,
    percent: total === 0 ? 100 : Math.min(100, (used / total) * 100),
    remaining: Math.max(0, total - used),
    full,
  };
}

export function freeLineCount(limits: QuotaPair, active: QuotaPair): number {
  return Math.max(0, limits.plans - active.plans);
}

export interface LimitsCardMode {
  showsLimits: boolean;
  selfServe: boolean;
}

export function limitsCardMode(model: PricingModel): LimitsCardMode {
  return {
    showsLimits: billingService.hasQuotaLimits(model),
    selfServe: billingService.changesLimitsInApp(model),
  };
}

export interface MonthlyBillView {
  amountText: string;
  noteKey: string;
  noteParams: Record<string, string | number>;
}

// Always USD, never the display currency — gotcha #145.
export function monthlyBillView(pricing: TenantPricing): MonthlyBillView {
  const amountText = formatMoney(billingService.monthlyAmountUsd(pricing), null, null);
  if (pricing.pricingModel !== "per_line") {
    return { amountText, noteKey: `billing.amount_note_${pricing.pricingModel}`, noteParams: {} };
  }
  if (billingService.isFreeTier(pricing)) {
    return { amountText, noteKey: "billing.amount_note_free", noteParams: { count: FREE_PLAN_LINES } };
  }
  return {
    amountText,
    noteKey: "billing.amount_note",
    noteParams: { count: pricing.planAllowance, price: pricing.pricePerPlanUsd.toString() },
  };
}

export function requestsByStatus(request: CustomerRequest | null): {
  pending: CustomerRequest | null;
  declined: CustomerRequest | null;
} {
  return {
    pending: request?.status === "pending" ? request : null,
    declined: request?.status === "declined" ? request : null,
  };
}
