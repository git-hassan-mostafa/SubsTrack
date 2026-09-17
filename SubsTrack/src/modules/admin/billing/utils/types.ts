// The two things a tenant's subscription caps. The BILL is counted on 'plans'.
export type QuotaKind = 'customers' | 'plans';

// One number per quota — a limit pair, an active-count pair or an ask pair.
export type QuotaPair = Record<QuotaKind, number>;

// Customers first, so a breach of both reports the one the admin hits first.
export const QUOTA_KINDS: QuotaKind[] = ['customers', 'plans'];

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

// The allowance every tenant is born with and none may go under. Mirrored by
// chk_tenants_customer_allowance_min and lower_allowances(). The plan allowance
// has no floor of its own — it may never sit below the customer one.
export const MIN_CUSTOMER_ALLOWANCE = 30;

// Must match the RAISEs in lower_allowances() — see sql scripts/script.sql.
export const ALLOWANCE_FLOOR_CODES: Record<QuotaKind, string> = {
  customers: 'active_customers_exceed_limit:',
  plans: 'active_plans_exceed_limit:',
};
