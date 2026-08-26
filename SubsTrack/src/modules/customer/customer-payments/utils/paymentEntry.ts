import { MONTHS } from '@/src/core/constants';
import type { MonthEntry, Payment } from '@/src/core/types';

/**
 * Wraps a recorded payment in the MonthEntry shape PaymentDetailSheet reads, for
 * surfaces that hold a payment but no month grid (the Payments tab, a debt row).
 * Status is always "paid" — any recorded payment is, partial included; the sheet
 * reads `balance` itself to show what is still owed.
 */
export function paymentToMonthEntry(payment: Payment): MonthEntry {
  const [year, month] = payment.billingMonth.split('-').map(Number);
  return {
    year,
    month,
    label: MONTHS[month - 1],
    billingMonth: payment.billingMonth,
    status: 'paid',
    payment,
    isGroupSecondary: false,
    balance: payment.balance,
    skip: null,
  };
}
