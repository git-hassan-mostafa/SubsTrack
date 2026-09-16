// A runaway loop would hammer the server, so the walk stops here however many
// pages are left. 200 pages is far past any list staff scroll.
const MAX_PAGES = 200;

/**
 * Keeps asking a paginated list for its next page until there is none left, and
 * hands back everything it ended up holding.
 *
 * It drives the screen's OWN `fetchMore` rather than querying around it, so the
 * slice's re-entry and stale-search guards still apply and the rows land where
 * the list already reads them. `read` is called fresh each turn because the
 * slice replaces its array on every page.
 *
 * Stops early if a page adds nothing — a `hasMore` that never clears would
 * otherwise spin forever.
 */
export async function loadAllPages<T>(
  read: () => readonly T[],
  hasMore: () => boolean,
  fetchMore: () => Promise<void>,
): Promise<readonly T[]> {
  for (let page = 0; page < MAX_PAGES && hasMore(); page += 1) {
    const before = read().length;
    await fetchMore();
    if (read().length === before) break;
  }
  return read();
}
