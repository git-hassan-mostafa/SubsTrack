// Serializable twin of CustomerLimitError, so the slice can hold it in state.
export interface CustomerLimitErrorPayload {
  allowance: number;
  activeCount: number;
}

// Serializable twin of AllowanceFloorError, so the slice can hold it in state.
export interface AllowanceFloorPayload {
  requested: number;
  activeCount: number;
}

export const MIN_CUSTOMER_REQUEST = 10;

// The allowance every tenant is born with and none may go under. Mirrored by
// chk_tenants_customer_allowance_min and lower_customer_allowance().
export const MIN_CUSTOMER_ALLOWANCE = 30;

// Must match the RAISE in lower_customer_allowance() — see sql scripts/script.sql.
export const ALLOWANCE_FLOOR_CODE = 'active_customers_exceed_limit:';
