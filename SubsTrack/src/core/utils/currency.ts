// Currency conversion + formatting. Pure utilities — no React, no Supabase.
//
// Convention everywhere in the app:
//   - A "null" Currency means USD (the implicit base).
//   - Stored amounts are literal numbers in their source currency (no canonical unit).
//   - Conversion goes via USD: toUsd then fromUsd.

import type { Currency } from '@/src/core/types';

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

// Sums money rows in USD via each row's FROZEN snapshot rate, never the live
// one — a later rate edit must not drift a historical total. The single
// aggregation behind every cash figure (revenue, debts, expenses, wallets).
export function sumUsd(
  rows: { amount: number; ratePerUsdSnapshot: number }[],
): number {
  return rows.reduce((total, r) => total + r.amount / r.ratePerUsdSnapshot, 0);
}

export function findCurrency(currencies: Currency[], id: string | null): Currency | null {
  if (!id) return null;
  return currencies.find((c) => c.id === id) ?? null;
}

// Currency to use when displaying a historical payment amount.
// Clones the current Currency but pins ratePerUsd to the row's frozen
// snapshot, so USD equivalents don't drift when the live rate is later edited.
// Structural on purpose: a charge froze the rate it was BILLED at, a collection
// the rate the money ARRIVED at, and both are read the same way.
export function snapshotCurrency(
  row: { currencyId: string | null; ratePerUsdSnapshot: number },
  currencies: Currency[],
): Currency | null {
  if (!row.currencyId) return null;
  const base = findCurrency(currencies, row.currencyId);
  if (!base) return null;
  return { ...base, ratePerUsd: row.ratePerUsdSnapshot };
}

export function formatMoney(
  amount: number,
  source: Currency | null,
  target: Currency | null,
): string {
  const value = convert(amount, source, target);
  if (target === null) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: target.decimals,
    maximumFractionDigits: target.decimals,
  }).format(value);
  return target.symbol ? `${formatted} ${target.symbol}` : `${formatted} ${target.code}`;
}

// Folds money rows into one entry per physical currency (+ its USD value via
// the row's frozen rate), largest first. What "physically collected" means on
// the wallets and in the reports currency split — the two must agree, so this
// lives here rather than inside either one.
export function groupByCurrency(
  rows: { amount: number; ratePerUsdSnapshot: number; currencyId: string | null }[],
): { currencyId: string | null; amount: number; usd: number }[] {
  const byCurrency = new Map<string, { currencyId: string | null; amount: number; usd: number }>();
  for (const r of rows) {
    const key = r.currencyId ?? 'USD';
    const usd = r.amount / r.ratePerUsdSnapshot;
    const cur = byCurrency.get(key);
    if (cur) {
      cur.amount += r.amount;
      cur.usd += usd;
    } else {
      byCurrency.set(key, { currencyId: r.currencyId, amount: r.amount, usd });
    }
  }
  return [...byCurrency.values()].sort((a, b) => b.usd - a.usd);
}


// Drops the currency symbol/code formatMoney appends, leaving the bare number.
function stripCurrencyLabel(formatted: string, target: Currency | null): string {
  if (!target) return formatted.replace(/^\$/, '');
  const suffix = ` ${target.symbol || target.code}`;
  return formatted.endsWith(suffix) ? formatted.slice(0, -suffix.length) : formatted;
}

// "20/50 $" — collected out of owed, as one amount. The currency label rides on
// the second half only; printing it twice reads as two separate figures.
export function formatPaidFraction(
  paid: number,
  due: number,
  source: Currency | null,
  target: Currency | null,
): string {
  const paidLabel = stripCurrencyLabel(formatMoney(paid, source, target), target);
  return `${paidLabel}/${formatMoney(due, source, target)}`;
}

export function formatMoneyPair(
  amount: number,
  source: Currency | null,
  display: Currency | null,
): { primary: string; approx: string | null } {
  const primary = formatMoney(amount, source, source);
  const same = (source?.id ?? null) === (display?.id ?? null);
  return { primary, approx: same ? null : `≈ ${formatMoney(amount, source, display)}` };
}
