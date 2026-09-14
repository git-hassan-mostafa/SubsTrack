// Same reason as products-barrel: the barrel exports the settings card and the
// limit modal alongside the service CustomerService needs.
export { default as billingService } from '@/src/modules/admin/billing/services/BillingService';
export { CustomerLimitError } from '@/src/modules/admin/billing/utils/customerLimitError';
export { MIN_CUSTOMER_REQUEST } from '@/src/modules/admin/billing/utils/types';
export type { CustomerLimitErrorPayload } from '@/src/modules/admin/billing/utils/types';
