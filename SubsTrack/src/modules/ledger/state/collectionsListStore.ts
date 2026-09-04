import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
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
import { getStore } from '@/src/state/globalStore';


/** Money that still counts, or only the reversals. */
export type CollectionStatus = 'live' | 'voided';

/** This month, newest first — what the screen opens on and clears back to. */
export const defaultCollectionsPeriod = (): ReportPeriod => periodFromPreset('this_month');

export interface CollectionsListState {
  items: CollectionListItem[];
  monthlyTotals: Record<string, number>;
  page: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  searchToken: number;
  customerFilter: Customer | null;
  receivedByUserId: string | null;
  period: ReportPeriod;
  kind: WalletSource | null;
  status: CollectionStatus | null;
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
  applyVoided: (voided: Collection) => void;
  clearError: () => void;
  reset: () => void;
}

function buildOptions(
  state: CollectionsListState,
  page: number,
  branchFilter: ReturnType<typeof resolveBranchFilter>,
) {
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
    includeVoided: state.status !== 'live',
    voidedOnly: state.status === 'voided',
  };
}

/** Every filter change restarts paging from scratch under a fresh token. */
const restart = (state: CollectionsListState) => {
  state.searchToken += 1;
  state.page = 0;
  state.items = [];
  state.hasMore = true;
};

export const useCollectionsListStore = create<CollectionsListState>()(
  immer((set, get) => ({
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
      const token = get().searchToken;
      const branchFilter = resolveBranchFilter(getStore().getState().auth.user);
      set((state) => {
        state.loading = true;
        state.error = null;
        state.page = 0;
      });
      try {
        const opts = buildOptions(get(), 0, branchFilter);
        const [items, monthlyTotals] = await Promise.all([
          collectionService.getHistory(opts),
          collectionService.getMonthlyTotals(opts),
        ]);
        if (get().searchToken !== token) return;
        set((state) => {
          state.items = items;
          state.monthlyTotals = monthlyTotals;
          state.hasMore = items.length === PAGE_SIZE;
          state.page = 0;
          state.loading = false;
        });
      } catch (e) {
        if (get().searchToken !== token) return;
        set((state) => {
          state.error = (e as Error).message;
          state.loading = false;
        });
      }
    },

    fetchMoreCollections: async () => {
      const { loadingMore, hasMore, page, searchToken } = get();
      if (loadingMore || !hasMore) return;
      const branchFilter = resolveBranchFilter(getStore().getState().auth.user);
      set((state) => {
        state.loadingMore = true;
      });
      try {
        const nextPage = page + 1;
        const items = await collectionService.getHistory(
          buildOptions(get(), nextPage, branchFilter),
        );
        if (get().searchToken !== searchToken) {
          set((state) => {
            state.loadingMore = false;
          });
          return;
        }
        set((state) => {
          state.items.push(...items);
          state.hasMore = items.length === PAGE_SIZE;
          state.page = nextPage;
          state.loadingMore = false;
        });
      } catch (e) {
        set((state) => {
          state.error = (e as Error).message;
          state.loadingMore = false;
        });
      }
    },

    setCustomerFilter: async (customer) => {
      if (get().customerFilter?.id === customer?.id) return;
      set((state) => {
        state.customerFilter = customer;
        restart(state);
      });
      await get().fetchCollections();
    },

    setReceivedByUserId: async (userId) => {
      if (get().receivedByUserId === userId) return;
      set((state) => {
        state.receivedByUserId = userId;
        restart(state);
      });
      await get().fetchCollections();
    },

    setPeriod: async (period) => {
      const now = get().period;
      const same =
        now.preset === period.preset &&
        now.fromDate === period.fromDate &&
        now.toDate === period.toDate;
      if (same) return;
      set((state) => {
        state.period = period;
        restart(state);
      });
      await get().fetchCollections();
    },

    setKind: async (kind) => {
      if (get().kind === kind) return;
      set((state) => {
        state.kind = kind;
        restart(state);
      });
      await get().fetchCollections();
    },

    setStatus: async (status) => {
      if (get().status === status) return;
      set((state) => {
        state.status = status;
        restart(state);
      });
      await get().fetchCollections();
    },

    setSortField: async (field) => {
      if (get().sortField === field) return;
      set((state) => {
        state.sortField = field;
        restart(state);
      });
      await get().fetchCollections();
    },

    setSortDirection: async (direction) => {
      if (get().sortDirection === direction) return;
      set((state) => {
        state.sortDirection = direction;
        restart(state);
      });
      await get().fetchCollections();
    },

    clearFilters: async () => {
      set((state) => {
        state.customerFilter = null;
        state.receivedByUserId = null;
        state.period = defaultCollectionsPeriod();
        state.kind = null;
        state.status = null;
        state.sortField = 'received_at';
        state.sortDirection = 'desc';
        restart(state);
      });
      await get().fetchCollections();
    },

    voidCollections: async (ids, voidedBy, reason) => {
      if (ids.length === 0) return;
      set((state) => {
        state.loading = true;
        state.error = null;
      });
      try {
        const voided = await collectionService.voidCollections(ids, voidedBy, reason);
        for (const c of voided) get().applyVoided(c);
        set((state) => {
          state.loading = false;
        });
        const global = getStore().getState();
        void global.ledger.fetchNetByCustomer(resolveBranchFilter(global.auth.user));
      } catch (e) {
        set((state) => {
          state.error = (e as Error).message;
          state.loading = false;
        });
      }
    },

    applyVoided: (voided) => {
      const before = get().items.find((c) => c.id === voided.id);
      set((state) => {
        state.items = state.items.map((c) =>
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
            state.monthlyTotals,
            before.receivedAt,
            -before.amount / before.ratePerUsdSnapshot,
          );
        }
      });
      if (before?.voidedAt) return;
      getStore().getState().sales.applyCollection(voided, -1);
      getStore().getState().ledger.markOwedChanged();
    },

    clearError: () =>
      set((state) => {
        state.error = null;
      }),

    reset: () =>
      set((state) => {
        state.items = [];
        state.monthlyTotals = {};
        state.page = 0;
        state.hasMore = true;
        state.loading = false;
        state.loadingMore = false;
        state.error = null;
        state.searchToken += 1;
        state.customerFilter = null;
        state.receivedByUserId = null;
        state.period = defaultCollectionsPeriod();
        state.kind = null;
        state.status = null;
        state.sortField = 'received_at';
        state.sortDirection = 'desc';
      }),
  })),
);
