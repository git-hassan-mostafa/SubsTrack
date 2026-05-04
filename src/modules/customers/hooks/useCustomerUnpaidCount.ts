import { useMemo } from 'react';
import type { Customer, Payment } from '@/src/core/types';
import { getCurrentYearMonth, isBeforeStartDate, toBillingMonth } from '@/src/core/utils/date';

// Returns the number of unpaid months for the current year for a given customer.
export function useCustomerUnpaidCount(customer: Customer, payments: Payment[]): number {
  return useMemo(() => {
    const { year, month: currentMonth } = getCurrentYearMonth();
    const paidMonths = new Set(payments.filter((p) => !p.voidedAt).map((p) => p.billingMonth));
    let unpaid = 0;
    for (let m = 1; m <= currentMonth; m++) {
      if (isBeforeStartDate(year, m, customer.startDate)) continue;
      if (!paidMonths.has(toBillingMonth(year, m))) unpaid++;
    }
    return unpaid;
  }, [customer, payments]);
}
