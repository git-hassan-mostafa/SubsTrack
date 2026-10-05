import type { CustomerRequest } from "@shared/core/types";
import { formatMoney } from "@shared/core/utils/currency";
import billingService from "@shared/modules/admin/billing/services/BillingService";
import type { QuotaPair } from "@shared/modules/admin/billing/utils/types";

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

export function monthlyAmountText(planAllowance: number, pricePerPlanUsd: number): string {
  return formatMoney(billingService.monthlyAmountUsd(planAllowance, pricePerPlanUsd), null, null);
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
