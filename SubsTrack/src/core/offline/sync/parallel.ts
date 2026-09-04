export const NETWORK_CONCURRENCY = 6;

/**
 * Run `fn` over every item with at most `limit` of them in flight. Results keep
 * the input order. `fn` must not throw — a rejection fails the whole batch, so
 * both callers here return a result object instead.
 */
export async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return out;
}
