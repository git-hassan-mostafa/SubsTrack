// Serializable twin of CustomerLimitError, so the slice can hold it in state.
export interface CustomerLimitErrorPayload {
  allowance: number;
  activeCount: number;
}

export const MIN_CUSTOMER_REQUEST = 10;
