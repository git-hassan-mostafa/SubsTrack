import type { StateCreator } from 'zustand';
import type { Collection, CollectionListItem, Customer, WalletSource } from '@/src/core/types';
import { PAGE_SIZE } from '@/src/core/constants';
import { periodFromPreset, toRange, type ReportPeriod } from '@/src/core/utils/dateRange';
import type {
  CollectionSortField,
  SortDirection,
} from '@/src/modules/ledger/repository/ICollectionRepository';
import { collectionService } from '@/src/modules/ledger';
import { resolveBranchFilter } from '@/src/shared/lib/branchFilter';
import { addMonthTotal } from '@/src/shared/lib/monthSections';
import type { GlobalState } from '@/src/state/globalStore';

/**
 * The money-in history — one paginated list of hand-overs.
 *
 * It replaces the payments list AND the debt-payments list: a month, a sale and
 * a custom fee are all settled by collecting, so there is one stream to page
 * through instead of three to merge.
 */
/** Money that still counts, or only the reversals. */
export type CollectionStatus = 'live' | 'voided';

/** This month, newest first — what the screen opens on and clears back to. */
export const defaultCollectionsPeriod = (): ReportPeriod => periodFromPreset('this_month');

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
  // The received-date window, exactly as the period chips present it.
  period: ReportPeriod;
  // What the cash paid for. Null = every type.
  kind: WalletSource | null;
  // Null = both live and voided rows.
  status: CollectionStatus | null;
  // Which date the list is ordered by.
  sortField: CollectionSortField;
  sortDirection: SortDirection;
  fetchCollections: () => Promise<void>;
  fetchMoreCollections: () => Promise<void>;
  setCustomerFilter: (customer: Customer | null) => Promise<void>;
  setReceivedByUserId: (userId: string | null) => Promise<void>;
  setPeriod: (period: ReportPeriod) => Promise<void>;
  setKind: (kind: WalletSource | null) => Promise<void>;
  setStatus: (status: CollectionStatus | null) => Promise<void>;
  setSortField: (field: CollectionSortField) => Promise<void>;
  setSortDirection: (direction: SortDirection) => Promise<void>;
  clearFilters: () => Promise<void>;
  voidCollections: (ids: string[], voidedBy: string, reason: string) => Promise<void>;
  /** A hand-over voided elsewhere (a bill sheet opened from this list). */
  applyVoided: (voided: Collection) => void;
  clearError: () => void;
  reset: () => void;
}

function buildOptions(
  state: CollectionsListSlice,
  page: number,
  branchFilter: ReturnType<typeof resolveBranchFilter>,
) {
  // A day bound is inclusive in the UI and an instant in the repository, and
  // toRange is that one conversion — shared with Reports and Expenses.
  const range = toRange(state.period);
  return {
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    branchFilter,
    customerId: state.customerFilter?.id ?? undefined,
    receivedByUserId: state.receivedByUserId ?? undefined,
    startIso: range.startIso,
    endExclusiveIso: range.endExclusiveIso,
    kind: state.kind ?? undefined,
    sortField: state.sortField,
    sortDirection: state.sortDirection,
    // History is a record of what happened, so a voided hand-over stays visible
    // (the card marks it). It is excluded from the section totals instead.
    includeVoided: state.status !== 'live',
    voidedOnly: state.status === 'voided',
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
  period: defaultCollectionsPeriod(),
  kind: null,
  status: null,
  sortField: 'received_at',
  sortDirection: 'desc',

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

  setPeriod: async (period) => {
    const now = get().collections.period;
    const same =
      now.preset === period.preset &&
      now.fromDate === period.fromDate &&
      now.toDate === period.toDate;
    if (same) return;
    set((state) => {
      state.collections.period = period;
      restart(state);
    });
    await get().collections.fetchCollections();
  },

  setKind: async (kind) => {
    if (get().collections.kind === kind) return;
    set((state) => {
      state.collections.kind = kind;
      restart(state);
    });
    await get().collections.fetchCollections();
  },

  setStatus: async (status) => {
    if (get().collections.status === status) return;
    set((state) => {
      state.collections.status = status;
      restart(state);
    });
    await get().collections.fetchCollections();
  },

  setSortField: async (field) => {
    if (get().collections.sortField === field) return;
    set((state) => {
      state.collections.sortField = field;
      restart(state);
    });
    await get().collections.fetchCollections();
  },

  setSortDirection: async (direction) => {
    if (get().collections.sortDirection === direction) return;
    set((state) => {
      state.collections.sortDirection = direction;
      restart(state);
    });
    await get().collections.fetchCollections();
  },

  // Resets to the default view: this month's money, newest first.
  clearFilters: async () => {
    set((state) => {
      state.collections.customerFilter = null;
      state.collections.receivedByUserId = null;
      state.collections.period = defaultCollectionsPeriod();
      state.collections.kind = null;
      state.collections.status = null;
      state.collections.sortField = 'received_at';
      state.collections.sortDirection = 'desc';
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
      for (const c of voided) get().collections.applyVoided(c);
      set((state) => {
        state.collections.loading = false;
      });
      // Every balance those rows touched came back — ONE read for the batch.
      void get().ledger.fetchNetByCustomer(resolveBranchFilter(get().auth.user));
    } catch (e) {
      set((state) => {
        state.collections.error = (e as Error).message;
        state.collections.loading = false;
      });
    }
  },

  applyVoided: (voided) => {
    // Only a row that was still LIVE gives money back — re-voiding changes
    // nothing, and this runs for hand-overs voided from a bill sheet too.
    const before = get().collections.items.find((c) => c.id === voided.id);
    set((state) => {
      // The row STAYS in the list, now marked as voided — history shows what
      // happened, including reversals. Only its contribution to the section
      // total drops (the totals query skips voided rows), and that is
      // subtracted here rather than re-queried.
      state.collections.items = state.collections.items.map((c) =>
        // Merge, not replace: `voided` carries no joined customer name.
        c.id === voided.id
          ? {
              ...c,
              voidedAt: voided.voidedAt,
              voidedBy: voided.voidedBy,
              voidReason: voided.voidReason,
            }
          : c,
      );
      if (before && !before.voidedAt) {
        addMonthTotal(
          state.collections.monthlyTotals,
          before.receivedAt,
          -before.amount / before.ratePerUsdSnapshot,
        );
      }
    });
    if (before?.voidedAt) return;
    // The row names the bills it had settled, so a sale it paid moves too.
    get().sales.applyCollection(voided, -1);
    // Those bills are owed again.
    get().ledger.markOwedChanged();
    // The debt badges are stale too, but that is ONE read per write — the
    // caller fires it after the whole batch, never once per row.
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
      state.collections.period = defaultCollectionsPeriod();
      state.collections.kind = null;
      state.collections.status = null;
      state.collections.sortField = 'received_at';
      state.collections.sortDirection = 'desc';
    }),
});
