import type { StateCreator } from 'zustand';
import type { CollectionListItem, Customer } from '@/src/core/types';
import { PAGE_SIZE } from '@/src/core/constants';
import { getDateMonthsAgoString, getTodayDateString } from '@/src/core/utils/date';
import { collectionService } from '@/src/modules/ledger';
import { resolveBranchFilter } from '@/src/shared/lib/branchFilter';
import type { GlobalState } from '@/src/state/globalStore';

/**
 * The money-in history — one paginated list of hand-overs.
 *
 * It replaces the payments list AND the debt-payments list: a month, a sale and
 * a custom fee are all settled by collecting, so there is one stream to page
 * through instead of three to merge.
 */
export interface CollectionsListSlice {
  items: CollectionListItem[];
  // "YYYY-MM" → USD total for that month, across ALL rows matching the current
  // filters (not just the loaded page) — the section headers' source of truth.
  // Refetched whenever the filters change (see fetchCollections).
  monthlyTotals: Record<string, number>;
  page: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  searchToken: number;
  customerFilter: Customer | null;
  receivedByUserId: string | null;
  // YYYY-MM-DD — received-date range; defaults to [one month ago, today].
  receivedFrom: string | null;
  receivedTo: string | null;
  fetchCollections: () => Promise<void>;
  fetchMoreCollections: () => Promise<void>;
  setCustomerFilter: (customer: Customer | null) => Promise<void>;
  setReceivedByUserId: (userId: string | null) => Promise<void>;
  setReceivedFrom: (date: string | null) => Promise<void>;
  setReceivedTo: (date: string | null) => Promise<void>;
  clearFilters: () => Promise<void>;
  voidCollections: (ids: string[], voidedBy: string, reason: string) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

// A date filter is a DAY, but received_at is an instant — so "to" must cover
// the whole of that day, hence the exclusive next-midnight bound.
function nextDayIso(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

function buildOptions(
  state: CollectionsListSlice,
  page: number,
  branchFilter: ReturnType<typeof resolveBranchFilter>,
) {
  return {
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    branchFilter,
    customerId: state.customerFilter?.id ?? undefined,
    receivedByUserId: state.receivedByUserId ?? undefined,
    startIso: state.receivedFrom
      ? new Date(`${state.receivedFrom}T00:00:00`).toISOString()
      : undefined,
    endExclusiveIso: state.receivedTo ? nextDayIso(state.receivedTo) : undefined,
    // History is a record of what happened, so a voided hand-over stays visible
    // (the card marks it). It is excluded from the section totals instead.
    includeVoided: true,
  };
}

/** Every filter change restarts paging from scratch under a fresh token. */
const restart = (state: GlobalState) => {
  state.collections.searchToken += 1;
  state.collections.page = 0;
  state.collections.items = [];
  state.collections.hasMore = true;
};

export const createCollectionsListSlice: StateCreator<
  GlobalState,
  [['zustand/immer', never]],
  [],
  CollectionsListSlice
> = (set, get) => ({
  items: [],
  monthlyTotals: {},
  page: 0,
  hasMore: true,
  loading: false,
  loadingMore: false,
  error: null,
  searchToken: 0,
  customerFilter: null,
  receivedByUserId: null,
  receivedFrom: getDateMonthsAgoString(1),
  receivedTo: getTodayDateString(),

  fetchCollections: async () => {
    const token = get().collections.searchToken;
    const branchFilter = resolveBranchFilter(get().auth.user);
    set((state) => {
      state.collections.loading = true;
      state.collections.error = null;
      state.collections.page = 0;
    });
    try {
      const opts = buildOptions(get().collections, 0, branchFilter);
      // The totals query is unpaginated but reuses the same filters — cheap
      // (3 numeric columns) and gives the section headers the true per-month
      // sum instead of only what has been paginated into `items`.
      const [items, monthlyTotals] = await Promise.all([
        collectionService.getHistory(opts),
        collectionService.getMonthlyTotals(opts),
      ]);
      if (get().collections.searchToken !== token) return;
      set((state) => {
        state.collections.items = items;
        state.collections.monthlyTotals = monthlyTotals;
        state.collections.hasMore = items.length === PAGE_SIZE;
        state.collections.page = 0;
        state.collections.loading = false;
      });
    } catch (e) {
      if (get().collections.searchToken !== token) return;
      set((state) => {
        state.collections.error = (e as Error).message;
        state.collections.loading = false;
      });
    }
  },

  fetchMoreCollections: async () => {
    const { loadingMore, hasMore, page, searchToken } = get().collections;
    if (loadingMore || !hasMore) return;
    const branchFilter = resolveBranchFilter(get().auth.user);
    set((state) => {
      state.collections.loadingMore = true;
    });
    try {
      const nextPage = page + 1;
      const items = await collectionService.getHistory(
        buildOptions(get().collections, nextPage, branchFilter),
      );
      if (get().collections.searchToken !== searchToken) {
        set((state) => {
          state.collections.loadingMore = false;
        });
        return;
      }
      set((state) => {
        state.collections.items.push(...items);
        state.collections.hasMore = items.length === PAGE_SIZE;
        state.collections.page = nextPage;
        state.collections.loadingMore = false;
      });
    } catch (e) {
      set((state) => {
        state.collections.error = (e as Error).message;
        state.collections.loadingMore = false;
      });
    }
  },

  setCustomerFilter: async (customer) => {
    if (get().collections.customerFilter?.id === customer?.id) return;
    set((state) => {
      state.collections.customerFilter = customer;
      restart(state);
    });
    await get().collections.fetchCollections();
  },

  setReceivedByUserId: async (userId) => {
    if (get().collections.receivedByUserId === userId) return;
    set((state) => {
      state.collections.receivedByUserId = userId;
      restart(state);
    });
    await get().collections.fetchCollections();
  },

  setReceivedFrom: async (date) => {
    if (get().collections.receivedFrom === date) return;
    set((state) => {
      state.collections.receivedFrom = date;
      restart(state);
    });
    await get().collections.fetchCollections();
  },

  setReceivedTo: async (date) => {
    if (get().collections.receivedTo === date) return;
    set((state) => {
      state.collections.receivedTo = date;
      restart(state);
    });
    await get().collections.fetchCollections();
  },

  // Resets to the default view: money received in the last month.
  clearFilters: async () => {
    set((state) => {
      state.collections.customerFilter = null;
      state.collections.receivedByUserId = null;
      state.collections.receivedFrom = getDateMonthsAgoString(1);
      state.collections.receivedTo = getTodayDateString();
      restart(state);
    });
    await get().collections.fetchCollections();
  },

  voidCollections: async (ids, voidedBy, reason) => {
    if (ids.length === 0) return;
    set((state) => {
      state.collections.loading = true;
      state.collections.error = null;
    });
    try {
      const voided = await collectionService.voidCollections(ids, voidedBy, reason);
      set((state) => {
        // The row STAYS in the list, now marked as voided — history shows what
        // happened, including reversals. Only its contribution to the section
        // total drops (the totals query skips voided rows).
        const byId = new Map(voided.map((c) => [c.id, c]));
        state.collections.items = state.collections.items.map((c) => {
          const v = byId.get(c.id);
          // Merge, not replace: `v` carries no joined customer name.
          return v ? { ...c, voidedAt: v.voidedAt, voidReason: v.voidReason } : c;
        });
        state.collections.loading = false;
      });
      // Every balance it touched came back, so the debt badges are stale.
      void get().ledger.fetchNetByCustomer(resolveBranchFilter(get().auth.user));
    } catch (e) {
      set((state) => {
        state.collections.error = (e as Error).message;
        state.collections.loading = false;
      });
    }
  },

  clearError: () =>
    set((state) => {
      state.collections.error = null;
    }),

  reset: () =>
    set((state) => {
      state.collections.items = [];
      state.collections.monthlyTotals = {};
      state.collections.page = 0;
      state.collections.hasMore = true;
      state.collections.loading = false;
      state.collections.loadingMore = false;
      state.collections.error = null;
      state.collections.searchToken += 1;
      state.collections.customerFilter = null;
      state.collections.receivedByUserId = null;
      state.collections.receivedFrom = getDateMonthsAgoString(1);
      state.collections.receivedTo = getTodayDateString();
    }),
});
