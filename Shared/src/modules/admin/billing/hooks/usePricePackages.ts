import {
  currentPackageSize,
  pricePackages,
  type PricePackage,
} from "@shared/modules/admin/billing/utils/packages";
import { useBillingSlice } from "@shared/state/hooks/useBillingSlice";
import { useOptionSlice } from "@shared/state/hooks/useOptionSlice";

export interface PricePackageView extends PricePackage {
  current: boolean;
}

export function usePricePackages(): PricePackageView[] {
  const options = useOptionSlice((s) => s.items);
  const pricingModel = useBillingSlice((s) => s.pricingModel);
  const planAllowance = useBillingSlice((s) => s.limits.plans);
  const current = currentPackageSize({ pricingModel, planAllowance });
  return pricePackages(options).map((p) => ({ ...p, current: p.size === current }));
}
