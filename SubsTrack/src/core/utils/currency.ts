// Currency conversion + formatting. Pure utilities — no React, no Supabase.
//
// Convention everywhere in the app:
//   - A "null" Currency means USD (the implicit base).
//   - Stored amounts are literal numbers in their source currency (no canonical unit).
//   - Conversion goes via USD: toUsd then fromUsd.

import type { Currency, Payment } from '@/src/core/types';

export function toUsd(amount: number, source: Currency | null): number {
  if (source === null) return amount;
  return amount / source.ratePerUsd;
}

export function fromUsd(amountUsd: number, target: Currency | null): number {
  if (target === null) return amountUsd;
  return amountUsd * target.ratePerUsd;
}

export function convert(
  amount: number,
  source: Currency | null,
  target: Currency | null,
): number {
  if (source?.id === target?.id) return amount;
  return fromUsd(toUsd(amount, source), target);
}

export function findCurrency(currencies: Currency[], id: string | null): Currency | null {
  if (!id) return null;
  return currencies.find((c) => c.id === id) ?? null;
}

// Currency to use when displaying a historical payment amount.
// Clones the current Currency but pins ratePerUsd to the payment's snapshot,
// so USD equivalents don't drift when the live rate is later edited.
export function paymentSnapshotCurrency(
  payment: Pick<Payment, 'currencyId' | 'ratePerUsdSnapshot'>,
  currencies: Currency[],
): Currency | null {
  if (!payment.currencyId) return null;
  const base = findCurrency(currencies, payment.currencyId);
  if (!base) return null;
  return { ...base, ratePerUsd: payment.ratePerUsdSnapshot };
}

export function formatMoney(
  amount: number,
  source: Currency | null,
  target: Currency | null,
  locale = 'en-US',
): string {
  const value = convert(amount, source, target);
  if (target === null) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: target.decimals,
    maximumFractionDigits: target.decimals,
  }).format(value);
  return target.symbol ? `${formatted} ${target.symbol}` : `${formatted} ${target.code}`;
}
