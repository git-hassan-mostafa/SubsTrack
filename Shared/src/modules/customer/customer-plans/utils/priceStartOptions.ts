import { billingMonthLabel } from "@shared/core/utils/billingMonth";
import { priceStartMonths } from "@shared/modules/customer/customer-plans/utils/priceHistory";

export interface PriceStartOption {
  value: string;
  label: string;
}

export function priceStartOptions(): PriceStartOption[] {
  return priceStartMonths().map((month) => ({
    value: month,
    label: billingMonthLabel(month, true),
  }));
}
