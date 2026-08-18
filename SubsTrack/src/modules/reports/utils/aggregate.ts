// Pure aggregation over already-fetched rows. Every report figure is built from
// these — no report issues a query of its own, and no aggregation is mirrored
// in SQL, so a number can only ever have one implementation.
//
// "USD" is always `amount / ratePerUsdSnapshot` (the row's FROZEN rate). Callers
// pass a `getUsd` so the same helpers work on CashRow and ExpenseItem alike.

export function groupBy<T, K extends string>(rows: T[], key: (r: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    const arr = out.get(k);
    if (arr) arr.push(r);
    else out.set(k, [r]);
  }
  return out;
}

export interface Entry {
  key: string;
  usd: number;
  count: number;
}

// Sum + count per key, largest first. The shape every breakdown and ranked list
// renders — by stream, by category, by staff, by customer, by branch.
export function sumByKey<T>(
  rows: T[],
  key: (r: T) => string,
  getUsd: (r: T) => number,
): Entry[] {
  const out = new Map<string, Entry>();
  for (const r of rows) {
    const k = key(r);
    const e = out.get(k);
    if (e) {
      e.usd += getUsd(r);
      e.count += 1;
    } else {
      out.set(k, { key: k, usd: getUsd(r), count: 1 });
    }
  }
  return [...out.values()].sort((a, b) => b.usd - a.usd);
}

// Keep the top N, fold the rest into one entry. `otherKey` is a sentinel the
// caller maps to a translated label — never a real key.
export function topN(entries: Entry[], n: number, otherKey = '__other__'): Entry[] {
  if (entries.length <= n) return entries;
  const head = entries.slice(0, n);
  const rest = entries.slice(n);
  head.push({
    key: otherKey,
    usd: rest.reduce((t, e) => t + e.usd, 0),
    count: rest.reduce((t, e) => t + e.count, 0),
  });
  return head;
}

// Each entry's share of the total, 0..1. Shares are of the ABSOLUTE total so a
// mixed-sign list (never the case today) can't produce a negative bar width.
export function shareOfTotal(entries: Entry[]): (Entry & { share: number })[] {
  const total = entries.reduce((t, e) => t + Math.abs(e.usd), 0);
  return entries.map((e) => ({ ...e, share: total === 0 ? 0 : Math.abs(e.usd) / total }));
}

export interface Delta {
  abs: number;
  pct: number | null; // null when the previous period was zero — no % exists
}

export function delta(current: number, previous: number): Delta {
  return {
    abs: current - previous,
    pct: previous === 0 ? null : (current - previous) / Math.abs(previous),
  };
}

export function sumUsdOf<T>(rows: T[], getUsd: (r: T) => number): number {
  return rows.reduce((t, r) => t + getUsd(r), 0);
}
