import type { AllocationLine, Currency, OpenItem } from '@/src/core/types';
import { findCurrency, toUsd } from '@/src/core/utils/currency';
import { allocate, keyOf, sortByDue, totalOwed } from './waterfall';

export interface CurrencyGroup {
  currencyId: string | null;
  currency: Currency | null;
  ratePerUsd: number;
  items: OpenItem[];
  owed: number;
  owedUsd: number;
}

export interface CurrencyPlan extends CurrencyGroup {
  amount: number | null;
  lines: AllocationLine[];
  leftover: number;
}

/**
 * One entry per currency the customer owes in, biggest debt first.
 *
 * A hand-over is single-currency (gotcha #108), so this is the unit a collect
 * screen writes in: N groups in, N `collections` rows out. The rate comes off
 * the LIVE currency, not an item's snapshot — the cash is arriving now.
 */
export function groupOwedByCurrency(
  items: OpenItem[],
  currencies: Currency[],
): CurrencyGroup[] {
  const groups = new Map<string, OpenItem[]>();
  for (const item of items) {
    const key = item.currencyId ?? '__usd__';
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }

  return [...groups.values()]
    .map((bucket) => {
      const currencyId = bucket[0].currencyId;
      const currency = findCurrency(currencies, currencyId);
      const owed = totalOwed(bucket);
      return {
        currencyId,
        currency,
        ratePerUsd: currency?.ratePerUsd ?? 1,
        items: sortByDue(bucket),
        owed,
        owedUsd: toUsd(owed, currency),
      };
    })
    .sort((a, b) => b.owedUsd - a.owedUsd);
}

/**
 * What each currency's typed amount will actually pay, oldest bill first.
 *
 * The split is run per group and never across them: converting one typed total
 * into another currency would record cash nobody handed over and leave a
 * balance short by the rounding dust.
 */
export function planCollection(
  groups: CurrencyGroup[],
  amounts: ReadonlyMap<string, number | null>,
  excluded: ReadonlySet<string>,
): CurrencyPlan[] {
  return groups.map((group) => {
    const amount = amounts.get(groupKey(group)) ?? null;
    const included = group.items.filter((i) => !excluded.has(keyOf(i)));
    const { lines, leftover } = allocate(amount ?? 0, included);
    return { ...group, amount, lines, leftover };
  });
}

/** Map key for a group — `currencyId` is nullable, so USD needs a stand-in. */
export function groupKey(group: { currencyId: string | null }): string {
  return group.currencyId ?? '__usd__';
}

/** Total being collected across every currency, in USD at today's rates. */
export function totalCollectingUsd(plans: CurrencyPlan[]): number {
  return plans.reduce(
    (sum, p) => sum + toUsd(p.lines.reduce((n, l) => n + l.amount, 0), p.currency),
    0,
  );
}

/** Groups with money on them — the ones that become a hand-over. */
export function fundedPlans(plans: CurrencyPlan[]): CurrencyPlan[] {
  return plans.filter((p) => p.lines.length > 0);
}
