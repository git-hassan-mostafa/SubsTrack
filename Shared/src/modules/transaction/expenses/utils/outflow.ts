import type { Currency } from "@shared/core/types";
import { formatMoney, formatMoneyPair } from "@shared/core/utils/currency";

// Printed unsigned: a stock credit (costed removal) is negative in the data.
export function outflowLabel(
  amount: number,
  source: Currency | null = null,
  target: Currency | null = null,
): string {
  return `${formatMoney(Math.abs(amount), source, target)}`;
}

export function outflowPair(
  amount: number,
  source: Currency | null,
  display: Currency | null,
): { primary: string; approx: string | null } {
  return formatMoneyPair(Math.abs(amount), source, display);
}
