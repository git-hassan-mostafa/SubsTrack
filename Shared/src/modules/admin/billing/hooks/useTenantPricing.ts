import type { TenantPricing } from "@shared/modules/admin/billing/utils/types";
import { useBillingSlice } from "@shared/state/hooks/useBillingSlice";

export function useTenantPricing(): TenantPricing {
  const pricingModel = useBillingSlice((s) => s.pricingModel);
  const planAllowance = useBillingSlice((s) => s.limits.plans);
  const pricePerPlanUsd = useBillingSlice((s) => s.pricePerPlanUsd);
  const fixedPriceUsd = useBillingSlice((s) => s.fixedPriceUsd);
  return { pricingModel, planAllowance, pricePerPlanUsd, fixedPriceUsd };
}
