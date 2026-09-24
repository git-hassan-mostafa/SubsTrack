export function groupBy<T, K extends string>(
  rows: T[],
  key: (r: T) => K,
): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    const arr = out.get(k);
    if (arr) arr.push(r);
    else out.set(k, [r]);
  }
  return out;
}
