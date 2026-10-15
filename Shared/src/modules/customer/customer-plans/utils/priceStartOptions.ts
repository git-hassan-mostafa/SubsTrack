import { billingMonthLabel } from "@shared/core/utils/billingMonth";
import {
  isPriceStartMonth,
  priceStartMonths,
} from "@shared/modules/customer/customer-plans/utils/priceHistory";

export interface PriceStartOption {
  value: string;
  label: string;
}

export function priceStartOptionsWith(existingMonth?: string | null): PriceStartOption[] {
  const months = priceStartMonths();
  if (existingMonth && isPriceStartMonth(existingMonth) && !months.includes(existingMonth)) {
    months.push(existingMonth);
    months.sort((a, b) => (a > b ? -1 : 1));
  }
  return months.map((month) => ({
    value: month,
    label: billingMonthLabel(month, true),
  }));
}
