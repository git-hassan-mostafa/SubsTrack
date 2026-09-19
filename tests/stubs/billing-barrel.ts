// Same reason as products-barrel: the barrel exports the settings card and the
// quota modal alongside the service CustomerService needs.
export { default as billingService } from "@/src/modules/admin/billing/services/BillingService";
export { QuotaExceededError } from "@/src/modules/admin/billing/utils/quotaError";
export { AllowanceFloorError } from "@/src/modules/admin/billing/utils/allowanceFloorError";
export { signedText } from "@/src/modules/admin/billing/utils/allowanceChange";
export {
  ALLOWANCE_FLOOR_CODES,
  MIN_CUSTOMER_ALLOWANCE,
  MIN_CUSTOMER_REQUEST,
  QUOTA_KINDS,
} from "@/src/modules/admin/billing/utils/types";
export type {
  AllowanceFloorPayload,
  QuotaErrorPayload,
  QuotaKind,
  QuotaPair,
} from "@/src/modules/admin/billing/utils/types";
