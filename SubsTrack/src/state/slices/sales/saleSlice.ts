import type { StateCreator } from 'zustand';
import type { Sale } from '@/src/core/types';
import { PAGE_SIZE } from '@/src/core/constants';
import { SaleService, type CreateSaleInput } from '@/src/modules/sales/services/SaleService';
import { resolveBranchFilter } from '@/src/shared/lib/branchFilter';
import type { GlobalState } from '@/src/state/globalStore';

const saleService = new SaleService();

export interface SaleSlice {
  items: Sale[];
  page: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  searchQuery: string;
  searchToken: number;
  fetchSales: () => Promise<void>;
  fetchMoreSales: () => Promise<void>;
  setSearchQuery: (q: string) => Promise<void>;
  createSale: (input: CreateSaleInput) => Promise<Sale | null>;
  voidSale: (id: string, voidedBy: string, reason: string) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

export const createSaleSlice: StateCreator<
  GlobalState,
  [['zustand/immer', never]],
  [],
  SaleSlice
> = (set, get) => ({
  items: [],
  page: 0,
  hasMore: true,
  loading: false,
  loadingMore: false,
  error: null,
  searchQuery: '',
  searchToken: 0,

  fetchSales: async () => {
    const token = get().sales.searchToken;
    const branchFilter = resolveBranchFilter(get().auth.user);
    const searchQuery = get().sales.searchQuery;
    set((state) => {
      state.sales.loading = true;
      state.sales.error = null;
      state.sales.page = 0;
    });
    try {
      const items = await saleService.getSales({
        page: 0,
        searchQuery: searchQuery || undefined,
        branchFilter,
      });
      if (get().sales.searchToken !== token) return;
      set((state) => {
        state.sales.items = items;
        state.sales.hasMore = items.length === PAGE_SIZE;
        state.sales.page = 0;
        state.sales.loading = false;
      });
    } catch (e) {
      if (get().sales.searchToken !== token) return;
      set((state) => {
        state.sales.error = (e as Error).message;
        state.sales.loading = false;
      });
    }
  },

  fetchMoreSales: async () => {
    const { loadingMore, hasMore, page, searchToken, searchQuery } = get().sales;
    if (loadingMore || !hasMore) return;
    const token = searchToken;
    const branchFilter = resolveBranchFilter(get().auth.user);
    set((state) => {
      state.sales.loadingMore = true;
    });
    try {
      const nextPage = page + 1;
      const items = await saleService.getSales({
        page: nextPage,
        searchQuery: searchQuery || undefined,
        branchFilter,
      });
      if (get().sales.searchToken !== token) {
        set((state) => {
          state.sales.loadingMore = false;
        });
        return;
      }
      set((state) => {
        state.sales.items.push(...items);
        state.sales.hasMore = items.length === PAGE_SIZE;
        state.sales.page = nextPage;
        state.sales.loadingMore = false;
      });
    } catch (e) {
      if (get().sales.searchToken !== token) {
        set((state) => {
          state.sales.loadingMore = false;
        });
        return;
      }
      set((state) => {
        state.sales.error = (e as Error).message;
        state.sales.loadingMore = false;
      });
    }
  },

  setSearchQuery: async (q) => {
    const trimmed = q.trim();
    if (trimmed === get().sales.searchQuery) return;
    set((state) => {
      state.sales.searchQuery = trimmed;
      state.sales.searchToken += 1;
      state.sales.page = 0;
      state.sales.items = [];
      state.sales.hasMore = true;
    });
    await get().sales.fetchSales();
  },

  createSale: async (input) => {
    set((state) => {
      state.sales.loading = true;
      state.sales.error = null;
    });
    try {
      const sale = await saleService.createSale(input);
      set((state) => {
        state.sales.items.unshift(sale);
        state.sales.loading = false;
      });
      return sale;
    } catch (e) {
      set((state) => {
        state.sales.error = (e as Error).message;
        state.sales.loading = false;
      });
      return null;
    }
  },

  voidSale: async (id, voidedBy, reason) => {
    set((state) => {
      state.sales.loading = true;
      state.sales.error = null;
    });
    try {
      const voided = await saleService.voidSale(id, voidedBy, reason);
      set((state) => {
        // The sales list excludes voided rows by default — drop it from view.
        state.sales.items = state.sales.items.filter((s) => s.id !== id);
        state.sales.loading = false;
        // Update the snapshot if a copy was kept somewhere by reference (no-op
        // for normal usage; keeps the reduced data observable in detail sheet).
        void voided;
      });
    } catch (e) {
      set((state) => {
        state.sales.error = (e as Error).message;
        state.sales.loading = false;
      });
    }
  },

  clearError: () =>
    set((state) => {
      state.sales.error = null;
    }),
  reset: () =>
    set((state) => {
      state.sales.items = [];
      state.sales.page = 0;
      state.sales.hasMore = true;
      state.sales.loading = false;
      state.sales.error = null;
      state.sales.searchQuery = '';
      state.sales.searchToken += 1;
    }),
});
