import type { Currency } from '@/src/core/types';
import { formatMoney } from '@/src/core/utils/currency';

/**
 * How every figure on the Expenses screen prints. Money out carries a leading
 * `−`; a CREDIT — a costed stock removal (wrong entry, returned to the supplier)
 * is negative in the data — flips to `+`, so a correction never reads as more
 * spending and never prints a double minus. One helper, because the card, the
 * headline and the month section totals all say the same thing.
 */
export function outflowLabel(
  amount: number,
  source: Currency | null = null,
  target: Currency | null = null,
): string {
  return `${formatMoney(Math.abs(amount), source, target)}`;
}
