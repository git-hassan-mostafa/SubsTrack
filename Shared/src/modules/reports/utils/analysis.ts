import { shareOfTotal } from "@shared/modules/reports/utils/aggregate";

export const NO_KEY = "__none__";

export type ReportFilter<D extends string> = Partial<Record<D, string>>;

// A customer with two plans sits in both plan groups, so a key may be a list.
export type KeyOf<R, D extends string> = (row: R, dim: D) => string | readonly string[];

export interface ReportGroup<R> {
  key: string;
  value: number;
  count: number;
  share: number;
  rows: R[];
}

function keysOf<R, D extends string>(row: R, dim: D, keyOf: KeyOf<R, D>): readonly string[] {
  const key = keyOf(row, dim);
  return typeof key === "string" ? [key] : key;
}

function setEntries<D extends string>(filter: ReportFilter<D>): [D, string][] {
  return (Object.entries(filter) as [D, string | undefined][]).filter(
    (entry): entry is [D, string] => entry[1] !== undefined,
  );
}

export function isFiltered<D extends string>(filter: ReportFilter<D>): boolean {
  return setEntries(filter).length > 0;
}

export function applyFilter<R, D extends string>(
  rows: readonly R[],
  filter: ReportFilter<D>,
  keyOf: KeyOf<R, D>,
): R[] {
  const set = setEntries(filter);
  if (set.length === 0) return [...rows];
  return rows.filter((row) =>
    set.every(([dim, value]) => keysOf(row, dim, keyOf).includes(value)),
  );
}

// Each pick honours every OTHER filter, so choosing an option never empties the view.
export function filterOptions<R, D extends string>(
  rows: readonly R[],
  filter: ReportFilter<D>,
  dim: D,
  keyOf: KeyOf<R, D>,
): string[] {
  const others: ReportFilter<D> = { ...filter };
  delete others[dim];
  const keys = new Set<string>();
  for (const row of applyFilter(rows, others, keyOf)) {
    for (const key of keysOf(row, dim, keyOf)) keys.add(key);
  }
  const picked = filter[dim];
  if (picked !== undefined) keys.add(picked);
  return [...keys];
}

// Largest first; pass `order` (time buckets) to keep a fixed order with empty groups.
export function groupRows<R, D extends string>(
  rows: readonly R[],
  dim: D,
  keyOf: KeyOf<R, D>,
  valueOf: (row: R) => number,
  order?: readonly string[],
): ReportGroup<R>[] {
  const groups = new Map<string, { key: string; usd: number; count: number; rows: R[] }>();
  for (const key of order ?? []) groups.set(key, { key, usd: 0, count: 0, rows: [] });
  for (const row of rows) {
    const value = valueOf(row);
    for (const key of keysOf(row, dim, keyOf)) {
      const group = groups.get(key) ?? { key, usd: 0, count: 0, rows: [] };
      group.usd += value;
      group.count += 1;
      group.rows.push(row);
      groups.set(key, group);
    }
  }
  const list = [...groups.values()];
  if (!order) list.sort((a, b) => b.usd - a.usd || b.count - a.count);
  const shares = shareOfTotal(list);
  return list.map((group, i) => ({
    key: group.key,
    value: group.usd,
    count: group.count,
    share: shares[i].share,
    rows: group.rows,
  }));
}
