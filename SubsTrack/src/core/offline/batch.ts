/**
 * Split a list into fixed-size slices. Both halves of the sync work in batches
 * and for different reasons, so the cap is always the caller's: a SQLite
 * statement can bind only so many parameters, and a PostgREST request carries
 * its ids in the query string.
 */
export function inBatches<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
