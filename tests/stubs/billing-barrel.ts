// Same reason as products-barrel: the barrel exports the settings card and the
// limit modal alongside the service CustomerService needs.
export { default as billingService } from '@/src/modules/admin/billing/services/BillingService';
export { CustomerLimitError } from '@/src/modules/admin/billing/utils/customerLimitError';
export { AllowanceFloorError } from '@/src/modules/admin/billing/utils/allowanceFloorError';
export { signedText } from '@/src/modules/admin/billing/utils/allowanceChange';
export {
  ALLOWANCE_FLOOR_CODE,
  MIN_CUSTOMER_ALLOWANCE,
  MIN_CUSTOMER_REQUEST,
} from '@/src/modules/admin/billing/utils/types';
export type {
  AllowanceFloorPayload,
  CustomerLimitErrorPayload,
} from '@/src/modules/admin/billing/utils/types';
