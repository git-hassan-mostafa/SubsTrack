import type { PricingModel } from "@shared/core/types";

// The two things a tenant's subscription caps. The BILL is counted on 'plans'.
export type QuotaKind = "customers" | "plans";

// One number per quota — a limit pair, an active-count pair or an ask pair.
export type QuotaPair = Record<QuotaKind, number>;

// Customers first, so a breach of both reports the one the admin hits first.
export const QUOTA_KINDS: QuotaKind[] = ["customers", "plans"];

// Serializable twin of QuotaExceededError, so the slice can hold it in state.
export interface QuotaErrorPayload {
  kind: QuotaKind;
  limit: number;
  activeCount: number;
}

// Serializable twin of AllowanceFloorError, so the slice can hold it in state.
export interface AllowanceFloorPayload {
  kind: QuotaKind;
  requested: number;
  activeCount: number;
}

// The minimum a request may ask for ACROSS both quotas, not per quota.
export const MIN_CUSTOMER_REQUEST = 10;

// Start + floor; SQL mirrors it in chk_tenants_customer_allowance_min_v2.
export const MIN_CUSTOMER_ALLOWANCE = 20;

// A per-line tenant allowed this many plans or fewer pays nothing.
export const FREE_PLAN_LINES = 20;

// Past this, a per-line tenant is offered a package instead of a request.
export const MAX_SELF_SERVE_PLANS = 100;

export interface TenantPricing {
  pricingModel: PricingModel;
  planAllowance: number;
  pricePerPlanUsd: number;
  fixedPriceUsd: number | null;
}

// Must match the RAISEs in lower_allowances() — see sql scripts/script.sql.
export const ALLOWANCE_FLOOR_CODES: Record<QuotaKind, string> = {
  customers: "active_customers_exceed_limit:",
  plans: "active_plans_exceed_limit:",
};
