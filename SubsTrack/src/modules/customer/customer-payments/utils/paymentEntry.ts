import { MONTHS } from '@/src/core/constants';
import type { Charge, MonthEntry } from '@/src/core/types';

/**
 * Wraps a month bill in the MonthEntry shape the grid sheets read, for surfaces
 * that hold a bill but no month grid (a debt row, a collection's split).
 * Status is always "paid" — the caller only reaches here for a bill money has
 * touched, partial included; the sheet reads `balance` for what is still owed.
 */
export function chargeToMonthEntry(charge: Charge, collected: number): MonthEntry {
  const billingMonth = charge.billingMonth ?? '';
  const [year, month] = billingMonth.split('-').map(Number);
  return {
    year,
    month,
    label: MONTHS[month - 1],
    billingMonth,
    status: 'paid',
    charge,
    collected,
    isGroupSecondary: false,
    balance: charge.amount - collected,
    skip: null,
  };
}
