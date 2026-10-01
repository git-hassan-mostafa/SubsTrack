import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type {
  Collection,
  CollectionListItem,
  Customer,
  WalletSource,
} from "@shared/core/types";
import { PAGE_SIZE } from "@shared/core/constants";
import type { ReportPeriod } from "@shared/core/utils/dateRange";
import type {
  CollectionSortField,
  SortDirection,
} from "@shared/modules/ledger/repository/ICollectionRepository";
import { collectionService } from "@shared/modules/ledger/services/CollectionService";
import {
  collectionFindOptions,
  defaultCollectionsPeriod,
  type CollectionStatus,
} from "@shared/modules/ledger/utils/collectionFilters";
import { resolveBranchFilter } from "@shared/shared/lib/branchFilter";
import { addMonthTotal } from "@shared/shared/lib/monthSections";
import { getStore } from "@shared/state/globalStore";

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
  voidCollections: (
    ids: string[],
    voidedBy: string,
    reason: string,
  ) => Promise<void>;
  applyVoided: (voided: Collection) => void;
  applyCorrected: () => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

function buildOptions(
  state: CollectionsListState,
  page: number,
  branchFilter: ReturnType<typeof resolveBranchFilter>,
) {
  return {
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    ...collectionFindOptions(
      { ...state, customerId: state.customerFilter?.id ?? null },
      branchFilter,
    ),
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
  immer((set, get) => {
    // Marks the row voided; false when it already was, so nothing counts twice.
    const patchVoided = (voided: Collection): boolean => {
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
      return !before?.voidedAt;
    };

    return {
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
      sortField: "received_at",
      sortDirection: "desc",

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
        const { loading, loadingMore, hasMore, page, searchToken } = get();
        if (loading || loadingMore || !hasMore) return;
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
          state.sortField = "received_at";
          state.sortDirection = "desc";
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
        const voided = await getStore()
          .getState()
          .ledger.voidCollections(ids, voidedBy, reason);
        const global = getStore().getState();
        if (voided === null) {
          const message = global.ledger.error;
          global.ledger.clearError();
          set((state) => {
            state.error = message;
            state.loading = false;
          });
          return;
        }
        for (const c of voided) patchVoided(c);
        set((state) => {
          state.loading = false;
        });
        void global.ledger.fetchNetByCustomer(
          resolveBranchFilter(global.auth.user),
        );
      },

      applyVoided: (voided) => {
        if (!patchVoided(voided)) return;
        getStore().getState().sales.applyCollection(voided, -1);
        getStore().getState().payments.applyCollection(voided, -1);
        getStore().getState().ledger.markOwedChanged();
      },

      applyCorrected: async () => {
        const global = getStore().getState();
        void global.ledger.fetchNetByCustomer(
          resolveBranchFilter(global.auth.user),
        );
        await get().fetchCollections();
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
          state.sortField = "received_at";
          state.sortDirection = "desc";
        }),
    };
  }),
);
