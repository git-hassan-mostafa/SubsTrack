import type { StateCreator } from "zustand";
import type { Collection, Customer, Product, Sale } from "@shared/core/types";
import { PAGE_SIZE, type BranchFilter } from "@shared/core/constants";
import { addSale, applyCollectionToSales, applyWriteOffToSales, applyVoidedSales, replaceSale, saleUsd } from "@shared/modules/transaction/sales/utils/saleListPatch";
import { cartUnits, savedUnits, stockDelta } from "@shared/modules/transaction/sales/utils/saleLines";
import saleService from "@shared/modules/transaction/sales/services/SaleService";
import type { CreateSaleInput, SaleVoidResult, UpdateSaleInput } from "@shared/modules/transaction/sales/utils/types";
import { hasSaleFilter, saleFindOptions, type SaleFilterChoice, type SaleStatus } from "@shared/modules/transaction/sales/utils/saleFilters";
import { resolveBranchFilter } from "@shared/shared/lib/branchFilter";
import { addMonthTotal } from "@shared/shared/lib/monthSections";
import type { GlobalState } from "@shared/state/globalStore";

export interface SaleSlice {
  items: Sale[];
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
  status: SaleStatus;
  fetchSales: () => Promise<void>;
  fetchMoreSales: () => Promise<void>;
  setSearchQuery: (q: string) => Promise<void>;
  setCustomerFilter: (customer: Customer | null) => Promise<void>;
  setProductFilter: (product: Product | null) => Promise<void>;
  setDateRange: (
    fromDate: string | null,
    toDate: string | null,
  ) => Promise<void>;
  setStatus: (status: SaleStatus) => Promise<void>;
  clearFilters: () => Promise<void>;
  createSale: (input: CreateSaleInput) => Promise<Sale | null>;
  updateSale: (sale: Sale, input: UpdateSaleInput) => Promise<Sale | null>;
  voidSale: (
    id: string,
    voidedBy: string,
    reason: string,
  ) => Promise<Sale | null>;
  voidSales: (
    ids: string[],
    voidedBy: string,
    reason: string,
  ) => Promise<SaleVoidResult>;
  applyCollection: (
    collection: Pick<Collection, "items">,
    sign?: 1 | -1,
  ) => void;
  applyWriteOff: (chargeId: string, writtenOffAt: string | null) => void;
  clearError: () => void;
  reset: () => void;
}

const filterChoice = (s: SaleSlice): SaleFilterChoice => ({
  customerId: s.customerFilter?.id ?? null,
  productId: s.productFilter?.id ?? null,
  fromDate: s.fromDate,
  toDate: s.toDate,
  status: s.status,
});

// A filtered list re-reads after a write; whether a row still belongs is a server question.
const isFiltered = (s: SaleSlice): boolean =>
  !!s.searchQuery || hasSaleFilter(filterChoice(s));

const filterOptions = (s: SaleSlice, branchFilter: BranchFilter) =>
  saleFindOptions(filterChoice(s), branchFilter, s.searchQuery);

export const createSaleSlice: StateCreator<
  GlobalState,
  [["zustand/immer", never]],
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
  searchQuery: "",
  searchToken: 0,
  customerFilter: null,
  productFilter: null,
  fromDate: null,
  toDate: null,
  status: "live",

  fetchSales: async () => {
    const token = get().sales.searchToken;
    const branchFilter = resolveBranchFilter(get().auth.user);
    set((state) => {
      state.sales.loading = true;
      state.sales.error = null;
      state.sales.page = 0;
    });
    try {
      const filterOpts = filterOptions(get().sales, branchFilter);
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
    const { loading, loadingMore, hasMore, page, searchToken } = get().sales;
    if (loading || loadingMore || !hasMore) return;
    const token = searchToken;
    const branchFilter = resolveBranchFilter(get().auth.user);
    set((state) => {
      state.sales.loadingMore = true;
    });
    try {
      const nextPage = page + 1;
      const items = await saleService.getSales({
        page: nextPage,
        ...filterOptions(get().sales, branchFilter),
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

  setStatus: async (status) => {
    if (get().sales.status === status) return;
    set((state) => {
      state.sales.status = status;
      state.sales.searchToken += 1;
      state.sales.page = 0;
      state.sales.items = [];
      state.sales.hasMore = true;
    });
    await get().sales.fetchSales();
  },

  clearFilters: async () => {
    if (!hasSaleFilter(filterChoice(get().sales))) return;
    set((state) => {
      state.sales.customerFilter = null;
      state.sales.productFilter = null;
      state.sales.fromDate = null;
      state.sales.toDate = null;
      state.sales.status = "live";
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
        state.sales.items = addSale(state.sales.items, sale);
        addMonthTotal(state.sales.monthlyTotals, sale.soldAt, saleUsd(sale));
        state.sales.loading = false;
      });
      get().products.applyStockDelta(
        stockDelta(new Map(), cartUnits(input.items)),
      );
      get().ledger.markOwedChanged();
      if (isFiltered(get().sales)) void get().sales.fetchSales();
      return sale;
    } catch (e) {
      set((state) => {
        state.sales.error = (e as Error).message;
        state.sales.loading = false;
      });
      return null;
    }
  },

  updateSale: async (sale, input) => {
    set((state) => {
      state.sales.loading = true;
      state.sales.error = null;
    });
    try {
      const updated = await saleService.updateSale(sale, input);
      set((state) => {
        state.sales.items = replaceSale(state.sales.items, updated);
        addMonthTotal(
          state.sales.monthlyTotals,
          updated.soldAt,
          saleUsd(updated) - saleUsd(sale),
        );
        state.sales.loading = false;
      });
      get().products.applyStockDelta(
        stockDelta(savedUnits(sale.items), cartUnits(input.items)),
      );
      get().ledger.markOwedChanged();
      if (isFiltered(get().sales)) void get().sales.fetchSales();
      return updated;
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
        state.sales.items = applyVoidedSales(
          state.sales.items,
          [voided],
          state.sales.status !== "live",
        );
        addMonthTotal(
          state.sales.monthlyTotals,
          voided.soldAt,
          -saleUsd(voided),
        );
        state.sales.loading = false;
      });
      get().products.applyStockDelta(
        stockDelta(savedUnits(voided.items), new Map()),
      );
      get().ledger.markOwedChanged();
      return voided;
    } catch (e) {
      set((state) => {
        state.sales.error = (e as Error).message;
        state.sales.loading = false;
      });
      return null;
    }
  },

  voidSales: async (ids, voidedBy, reason) => {
    if (ids.length === 0) return { ok: 0, failed: 0, voided: [] };
    set((state) => {
      state.sales.loading = true;
      state.sales.error = null;
    });
    const { voided, failed } = await saleService.voidSales(
      ids,
      voidedBy,
      reason,
    );
    set((state) => {
      state.sales.items = applyVoidedSales(
        state.sales.items,
        voided,
        state.sales.status !== "live",
      );
      for (const s of voided) {
        addMonthTotal(state.sales.monthlyTotals, s.soldAt, -saleUsd(s));
      }
      state.sales.loading = false;
      state.sales.error = failed.at(-1)?.message ?? null;
    });
    const returned = new Map<string, number>();
    for (const s of voided) {
      for (const [id, units] of savedUnits(s.items)) {
        returned.set(id, (returned.get(id) ?? 0) + units);
      }
    }
    get().products.applyStockDelta(stockDelta(returned, new Map()));
    if (voided.length > 0) get().ledger.markOwedChanged();
    return { ok: voided.length, failed: failed.length, voided };
  },

  applyCollection: (collection, sign = 1) =>
    set((state) => {
      state.sales.items = applyCollectionToSales(
        state.sales.items,
        collection,
        sign,
      );
    }),

  applyWriteOff: (chargeId, writtenOffAt) =>
    set((state) => {
      state.sales.items = applyWriteOffToSales(
        state.sales.items,
        chargeId,
        writtenOffAt,
      );
    }),

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
      state.sales.searchQuery = "";
      state.sales.searchToken += 1;
      state.sales.customerFilter = null;
      state.sales.productFilter = null;
      state.sales.fromDate = null;
      state.sales.toDate = null;
      state.sales.status = "live";
    }),
});
