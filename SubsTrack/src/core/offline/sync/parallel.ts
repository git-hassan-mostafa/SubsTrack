// The sync engine's fan-out primitive. Its counterpart — the lock that keeps
// local SQLite work sequential — is `withDbLock` in `../dbLock`, shared with
// every repository write because the whole app has one connection.

/**
 * How many Supabase requests may be in flight at once. The engine fetches every
 * table concurrently, so this cap is what keeps a first full sync from holding
 * twenty 1000-row pages in memory (and twenty sockets open on a mobile radio)
 * at the same moment.
 */
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
