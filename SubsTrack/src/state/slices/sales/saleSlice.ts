import type { StateCreator } from 'zustand';
import type { Customer, Product, Sale } from '@/src/core/types';
import { PAGE_SIZE } from '@/src/core/constants';
import { saleService, type CreateSaleInput } from '@/src/modules/sales';
import { resolveBranchFilter } from '@/src/shared/lib/branchFilter';
import type { GlobalState } from '@/src/state/globalStore';

export interface SaleSlice {
  items: Sale[];
  // "YYYY-MM" → USD total for that month, across ALL rows matching the
  // current filters (not just the loaded page) — the section headers' source
  // of truth. Refetched whenever the filters change (see fetchSales).
  monthlyTotals: Record<string, number>;
  page: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  searchQuery: string;
  searchToken: number;
  customerFilter: Customer | null;
  productFilter: Product | null;
  fromDate: string | null;
  toDate: string | null;
  fetchSales: () => Promise<void>;
  fetchMoreSales: () => Promise<void>;
  setSearchQuery: (q: string) => Promise<void>;
  setCustomerFilter: (customer: Customer | null) => Promise<void>;
  setProductFilter: (product: Product | null) => Promise<void>;
  setDateRange: (fromDate: string | null, toDate: string | null) => Promise<void>;
  clearFilters: () => Promise<void>;
  createSale: (input: CreateSaleInput) => Promise<Sale | null>;
  voidSale: (id: string, voidedBy: string, reason: string) => Promise<void>;
  voidSales: (
    ids: string[],
    voidedBy: string,
    reason: string,
  ) => Promise<{ ok: number; failed: number }>;
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
  monthlyTotals: {},
  page: 0,
  hasMore: true,
  loading: false,
  loadingMore: false,
  error: null,
  searchQuery: '',
  searchToken: 0,
  customerFilter: null,
  productFilter: null,
  fromDate: null,
  toDate: null,

  fetchSales: async () => {
    const token = get().sales.searchToken;
    const branchFilter = resolveBranchFilter(get().auth.user);
    const { searchQuery, customerFilter, productFilter, fromDate, toDate } = get().sales;
    set((state) => {
      state.sales.loading = true;
      state.sales.error = null;
      state.sales.page = 0;
    });
    try {
      const filterOpts = {
        searchQuery: searchQuery || undefined,
        branchFilter,
        customerId: customerFilter?.id ?? null,
        productId: productFilter?.id ?? null,
        fromDate,
        toDate,
      };
      // The totals query is unpaginated but reuses the same filters — cheap
      // (no joins, 3 numeric columns) and gives the section headers the true
      // per-month sum instead of only what's been paginated into `items`.
      const [items, monthlyTotals] = await Promise.all([
        saleService.getSales({ page: 0, ...filterOpts }),
        saleService.getMonthlyTotals(filterOpts),
      ]);
      if (get().sales.searchToken !== token) return;
      set((state) => {
        state.sales.items = items;
        state.sales.monthlyTotals = monthlyTotals;
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
    const {
      loadingMore,
      hasMore,
      page,
      searchToken,
      searchQuery,
      customerFilter,
      productFilter,
      fromDate,
      toDate,
    } = get().sales;
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
        customerId: customerFilter?.id ?? null,
        productId: productFilter?.id ?? null,
        fromDate,
        toDate,
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

  setCustomerFilter: async (customer) => {
    const current = get().sales.customerFilter;
    if (current?.id === customer?.id) return;
    set((state) => {
      state.sales.customerFilter = customer;
      state.sales.searchToken += 1;
      state.sales.page = 0;
      state.sales.items = [];
      state.sales.hasMore = true;
    });
    await get().sales.fetchSales();
  },

  setProductFilter: async (product) => {
    const current = get().sales.productFilter;
    if (current?.id === product?.id) return;
    set((state) => {
      state.sales.productFilter = product;
      state.sales.searchToken += 1;
      state.sales.page = 0;
      state.sales.items = [];
      state.sales.hasMore = true;
    });
    await get().sales.fetchSales();
  },

  setDateRange: async (fromDate, toDate) => {
    const current = get().sales;
    if (current.fromDate === fromDate && current.toDate === toDate) return;
    set((state) => {
      state.sales.fromDate = fromDate;
      state.sales.toDate = toDate;
      state.sales.searchToken += 1;
      state.sales.page = 0;
      state.sales.items = [];
      state.sales.hasMore = true;
    });
    await get().sales.fetchSales();
  },

  clearFilters: async () => {
    const { customerFilter, productFilter, fromDate, toDate } = get().sales;
    if (!customerFilter && !productFilter && !fromDate && !toDate) return;
    set((state) => {
      state.sales.customerFilter = null;
      state.sales.productFilter = null;
      state.sales.fromDate = null;
      state.sales.toDate = null;
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

  // Voids several sales with one shared reason. Each void is its own DB write
  // (mirrors the per-row voidSale); voided rows drop out of the list and the
  // last failure's message is surfaced. Returns counts so the screen can show a
  // "voided X · Y failed" notice.
  voidSales: async (ids, voidedBy, reason) => {
    if (ids.length === 0) return { ok: 0, failed: 0 };
    set((state) => {
      state.sales.loading = true;
      state.sales.error = null;
    });
    const trimmed = reason.trim();
    const voidedIds: string[] = [];
    let failed = 0;
    let lastError: string | null = null;
    for (const id of ids) {
      try {
        await saleService.voidSale(id, voidedBy, trimmed);
        voidedIds.push(id);
      } catch (e) {
        failed++;
        lastError = (e as Error).message;
      }
    }
    set((state) => {
      const removed = new Set(voidedIds);
      state.sales.items = state.sales.items.filter((s) => !removed.has(s.id));
      state.sales.loading = false;
      state.sales.error = lastError;
    });
    return { ok: voidedIds.length, failed };
  },

  clearError: () =>
    set((state) => {
      state.sales.error = null;
    }),
  reset: () =>
    set((state) => {
      state.sales.items = [];
      state.sales.monthlyTotals = {};
      state.sales.page = 0;
      state.sales.hasMore = true;
      state.sales.loading = false;
      state.sales.error = null;
      state.sales.searchQuery = '';
      state.sales.searchToken += 1;
      state.sales.customerFilter = null;
      state.sales.productFilter = null;
      state.sales.fromDate = null;
      state.sales.toDate = null;
    }),
});
