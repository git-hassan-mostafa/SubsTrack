import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { ChargeKind, Customer, DebtHistoryItem } from "@shared/core/types";
import { PAGE_SIZE } from "@shared/core/constants";
import { chargeService } from "@shared/modules/ledger/services/ChargeService";
import { resolveBranchFilter } from "@shared/shared/lib/branchFilter";
import { getStore } from "@shared/state/globalStore";
import {
  DEFAULT_DEBT_HISTORY_FILTERS,
  debtHistoryReadOptions,
  type DebtHistoryFilters,
  type HistoryOutcome,
  type HistoryPeriodPreset,
  type HistorySort,
} from "@shared/modules/transaction/debts/utils/debtHistory";

export interface DebtHistoryState extends DebtHistoryFilters {
  customer: Customer | null;
  items: DebtHistoryItem[];
  page: number;
  hasMore: boolean;
  loading: boolean;
  loaded: boolean;
  loadingMore: boolean;
  error: string | null;
  searchToken: number;
  fetchHistory: () => Promise<void>;
  fetchMoreHistory: () => Promise<void>;
  setCustomer: (customer: Customer | null) => Promise<void>;
  setPeriod: (period: HistoryPeriodPreset) => Promise<void>;
  setOutcome: (outcome: HistoryOutcome | null) => Promise<void>;
  setKind: (kind: ChargeKind | null) => Promise<void>;
  setSort: (sort: HistorySort) => Promise<void>;
  clearFilters: () => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

function buildOptions(state: DebtHistoryState, page: number) {
  return {
    ...debtHistoryReadOptions(
      state,
      resolveBranchFilter(getStore().getState().auth.user),
    ),
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  };
}

/** Every filter change restarts paging from scratch under a fresh token. */
const restart = (state: DebtHistoryState) => {
  state.searchToken += 1;
  state.page = 0;
  state.items = [];
  state.hasMore = true;
};

/**
 * Past bills and what became of each — the backward-looking twin of the debts
 * list, which only ever shows what is open NOW.
 *
 * A module store rather than a slice: nothing outside the debts module reads it.
 * It is a pure read surface, so there is no patch path — a write elsewhere
 * bumps `owedVersion` and the sheet re-reads itself.
 */
export const useDebtHistoryStore = create<DebtHistoryState>()(
  immer((set, get) => ({
    ...DEFAULT_DEBT_HISTORY_FILTERS,
    customer: null,
    items: [],
    page: 0,
    hasMore: true,
    loading: false,
    loaded: false,
    loadingMore: false,
    error: null,
    searchToken: 0,

    fetchHistory: async () => {
      const token = get().searchToken;
      set((state) => {
        state.loading = true;
        state.error = null;
        state.page = 0;
      });
      try {
        const items = await chargeService.getChargeHistory(
          buildOptions(get(), 0),
        );
        if (get().searchToken !== token) return;
        set((state) => {
          state.items = items;
          state.hasMore = items.length === PAGE_SIZE;
          state.page = 0;
          state.loading = false;
          state.loaded = true;
        });
      } catch (e) {
        if (get().searchToken !== token) return;
        set((state) => {
          state.error = (e as Error).message;
          state.loading = false;
          state.loaded = true;
        });
      }
    },

    fetchMoreHistory: async () => {
      const { loading, loadingMore, hasMore, page, searchToken } = get();
      if (loading || loadingMore || !hasMore) return;
      set((state) => {
        state.loadingMore = true;
      });
      try {
        const nextPage = page + 1;
        const items = await chargeService.getChargeHistory(
          buildOptions(get(), nextPage),
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

    setCustomer: async (customer) => {
      if (get().customer?.id === (customer?.id ?? null)) return;
      set((state) => {
        state.customer = customer;
        state.customerId = customer?.id ?? null;
        restart(state);
      });
      await get().fetchHistory();
    },

    setPeriod: async (period) => {
      if (get().period === period) return;
      set((state) => {
        state.period = period;
        restart(state);
      });
      await get().fetchHistory();
    },

    setOutcome: async (outcome) => {
      if (get().outcome === outcome) return;
      set((state) => {
        state.outcome = outcome;
        restart(state);
      });
      await get().fetchHistory();
    },

    setKind: async (kind) => {
      if (get().kind === kind) return;
      set((state) => {
        state.kind = kind;
        restart(state);
      });
      await get().fetchHistory();
    },

    setSort: async (sort) => {
      if (get().sort === sort) return;
      set((state) => {
        state.sort = sort;
        restart(state);
      });
      await get().fetchHistory();
    },

    clearFilters: async () => {
      set((state) => {
        Object.assign(state, DEFAULT_DEBT_HISTORY_FILTERS);
        state.customer = null;
        restart(state);
      });
      await get().fetchHistory();
    },

    clearError: () => {
      set((state) => {
        state.error = null;
      });
    },

    reset: () => {
      set((state) => {
        Object.assign(state, DEFAULT_DEBT_HISTORY_FILTERS);
        state.customer = null;
        state.items = [];
        state.page = 0;
        state.hasMore = true;
        state.loading = false;
        state.loaded = false;
        state.loadingMore = false;
        state.error = null;
        state.searchToken += 1;
      });
    },
  })),
);
