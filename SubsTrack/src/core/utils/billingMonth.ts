import { MONTHS } from '@/src/core/constants';
import i18n from '@/src/core/i18n';

/** "Mar 2026" for a YYYY-MM-01 billing month; `long` gives "March 2026". */
export function billingMonthLabel(billingMonth: string, long = false): string {
  const [year, month] = billingMonth.split('-').map(Number);
  const key = MONTHS[month - 1];
  if (!key || !year) return billingMonth;
  return `${i18n.t(`${long ? 'months_long' : 'months'}.${key}`)} ${year}`;
}
