import type { StateCreator } from 'zustand';
import type { Currency, Product, TierPlan, TenantUsage } from '@/src/core/types';
import {
  productService,
  type ProductInput,
  type RestockEntry,
  type StockAdjustReason,
} from '@/src/modules/admin/products';
import { resolveBranchFilter } from '@/src/shared/lib/branchFilter';
import { TierLimitError } from '@/src/modules/admin/subscription';
import type { TierLimitErrorPayload } from '@/src/modules/admin/subscription';
import type { GlobalState } from '@/src/state/globalStore';

export interface ProductSlice {
  items: Product[];
  /**
   * A fetch has completed at least once. The "ensure loaded" guard keys off this,
   * NOT `items.length` — an empty result is a valid loaded state, and a length-based
   * guard re-queries on every caller (i.e. every form open) for a tenant with no rows.
   */
  loaded: boolean;
  loading: boolean;
  error: string | null;
  tierLimitError: TierLimitErrorPayload | null;
  getProducts: () => Promise<void>;
  fetchProducts: () => Promise<void>;
  createProduct: (
    data: ProductInput,
    tenantId: string,
    tier: TierPlan,
    usage: TenantUsage,
    userId?: string | null,
    // Carries the live rate the opening stock's cost is frozen at.
    costCurrency?: Currency | null,
  ) => Promise<void>;
  updateProduct: (id: string, data: ProductInput) => Promise<void>;
  adjustStock: (
    id: string,
    tenantId: string,
    delta: number,
    reason: StockAdjustReason,
    note?: string | null,
    userId?: string | null,
    // What the stock cost — an expense when adding, money back when removing.
    cost?: { unitCost: number | null; currency: Currency | null } | null,
  ) => Promise<boolean>;
  /**
   * Correct one manual ledger row (the record was wrong). `quantity` is the
   * magnitude — the direction stays whatever the row already was.
   */
  updateStockMovement: (
    movementId: string,
    input: {
      quantity: number;
      note?: string | null;
      cost?: { unitCost: number | null; currency: Currency | null } | null;
    },
  ) => Promise<boolean>;
  /**
   * Reverse one manual ledger row — the entry should never have existed. It stops
   * counting in stock and in Expenses; the row stays, marked reversed.
   */
  revertStockMovement: (movementId: string, userId?: string | null) => Promise<boolean>;
  batchRestock: (
    entries: RestockEntry[],
    tenantId: string,
    note?: string | null,
    userId?: string | null,
    // One delivery, one currency — shared by every entry's unitCost.
    currency?: Currency | null,
  ) => Promise<boolean>;
  deleteProduct: (id: string) => Promise<'hard' | 'soft' | null>;
  bulkDeleteProducts: (ids: string[]) => Promise<boolean>;
  reactivateProduct: (id: string) => Promise<void>;
  clearError: () => void;
  clearTierLimitError: () => void;
  reset: () => void;
}

export const createProductSlice: StateCreator<
  GlobalState,
  [['zustand/immer', never]],
  [],
  ProductSlice
> = (set, get) => ({
  items: [],
  loaded: false,
  loading: false,
  error: null,
  tierLimitError: null,
  getProducts: async () => {
    const { loaded, loading } = get().products;
    // Already loaded, or a fetch is already in flight — several components
    // mount-fetch the same slice in one tick (see docs/gotchas.md).
    if (loaded || loading) return;
    await get().products.fetchProducts();
  },
  fetchProducts: async () => {
    set((state) => {
      state.products.loading = true;
      state.products.error = null;
    });
    try {
      const branchFilter = resolveBranchFilter(get().auth.user);
      const items = await productService.getProducts(branchFilter);
      set((state) => {
        state.products.items = items;
        state.products.loaded = true;
        state.products.loading = false;
      });
    } catch (e) {
      set((state) => {
        state.products.error = (e as Error).message;
        state.products.loading = false;
      });
    }
  },

  createProduct: async (data, tenantId, tier, usage, userId, costCurrency = null) => {
    set((state) => {
      state.products.loading = true;
      state.products.error = null;
      state.products.tierLimitError = null;
    });
    try {
      const product = await productService.createProduct(
        data,
        tenantId,
        tier,
        usage,
        userId ?? get().auth.user?.id ?? null,
        costCurrency,
      );
      set((state) => {
        state.products.items.unshift(product);
        state.products.loading = false;
      });
      void get().subscription.refreshUsage();
    } catch (e) {
      if (e instanceof TierLimitError) {
        set((state) => {
          state.products.tierLimitError = {
            resource: e.resource,
            limit: e.limit,
            tierCode: e.tierCode,
          };
          state.products.loading = false;
        });
      } else {
        set((state) => {
          state.products.error = (e as Error).message;
          state.products.loading = false;
        });
      }
    }
  },

  updateProduct: async (id, data) => {
    set((state) => {
      state.products.loading = true;
      state.products.error = null;
    });
    try {
      const updated = await productService.updateProduct(id, data);
      set((state) => {
        const i = state.products.items.findIndex((p) => p.id === id);
        if (i !== -1) state.products.items[i] = updated;
        state.products.loading = false;
      });
    } catch (e) {
      set((state) => {
        state.products.error = (e as Error).message;
        state.products.loading = false;
      });
    }
  },

  adjustStock: async (id, tenantId, delta, reason, note = null, userId = null, cost = null) => {
    set((state) => {
      state.products.loading = true;
      state.products.error = null;
    });
    try {
      const onHand = await productService.adjustStock(
        id,
        tenantId,
        delta,
        reason,
        note,
        userId,
        cost,
      );
      set((state) => {
        const i = state.products.items.findIndex((p) => p.id === id);
        if (i !== -1) state.products.items[i].stockOnHand = onHand;
        state.products.loading = false;
      });
      return true;
    } catch (e) {
      set((state) => {
        state.products.error = (e as Error).message;
        state.products.loading = false;
      });
      return false;
    }
  },

  updateStockMovement: async (movementId, input) => {
    set((state) => {
      state.products.loading = true;
      state.products.error = null;
    });
    try {
      const { movement, onHand } = await productService.updateMovement(movementId, input);
      set((state) => {
        const i = state.products.items.findIndex((p) => p.id === movement.productId);
        if (i !== -1) state.products.items[i].stockOnHand = onHand;
        state.products.loading = false;
      });
      return true;
    } catch (e) {
      set((state) => {
        state.products.error = (e as Error).message;
        state.products.loading = false;
      });
      return false;
    }
  },

  revertStockMovement: async (movementId, userId = null) => {
    set((state) => {
      state.products.loading = true;
      state.products.error = null;
    });
    try {
      const { productId, onHand } = await productService.revertMovement(movementId, userId);
      set((state) => {
        const i = state.products.items.findIndex((p) => p.id === productId);
        if (i !== -1) state.products.items[i].stockOnHand = onHand;
        state.products.loading = false;
      });
      return true;
    } catch (e) {
      set((state) => {
        state.products.error = (e as Error).message;
        state.products.loading = false;
      });
      return false;
    }
  },

  batchRestock: async (entries, tenantId, note = null, userId = null, currency = null) => {
    if (entries.length === 0) return true;
    set((state) => {
      state.products.loading = true;
      state.products.error = null;
    });
    try {
      const onHand = await productService.restockMany(
        entries,
        tenantId,
        note,
        userId,
        currency,
      );
      set((state) => {
        for (const p of state.products.items) {
          if (p.id in onHand) p.stockOnHand = onHand[p.id];
        }
        state.products.loading = false;
      });
      return true;
    } catch (e) {
      set((state) => {
        state.products.error = (e as Error).message;
        state.products.loading = false;
      });
      return false;
    }
  },

  deleteProduct: async (id) => {
    set((state) => {
      state.products.loading = true;
      state.products.error = null;
    });
    try {
      const mode = await productService.deleteProduct(id);
      set((state) => {
        if (mode === 'hard') {
          state.products.items = state.products.items.filter((p) => p.id !== id);
        } else {
          const i = state.products.items.findIndex((p) => p.id === id);
          if (i !== -1) state.products.items[i].active = false;
        }
        state.products.loading = false;
      });
      void get().subscription.refreshUsage();
      return mode;
    } catch (e) {
      set((state) => {
        state.products.error = (e as Error).message;
        state.products.loading = false;
      });
      return null;
    }
  },

  bulkDeleteProducts: async (ids) => {
    if (ids.length === 0) return true;
    set((state) => {
      state.products.loading = true;
      state.products.error = null;
    });
    try {
      const { hard, soft } = await productService.deleteManyProducts(ids);
      set((state) => {
        const removed = new Set(hard);
        const softened = new Set(soft);
        state.products.items = state.products.items.filter((p) => !removed.has(p.id));
        for (const p of state.products.items) {
          if (softened.has(p.id)) p.active = false;
        }
        state.products.loading = false;
      });
      void get().subscription.refreshUsage();
      return true;
    } catch (e) {
      set((state) => {
        state.products.error = (e as Error).message;
        state.products.loading = false;
      });
      return false;
    }
  },

  reactivateProduct: async (id) => {
    set((state) => {
      state.products.loading = true;
      state.products.error = null;
    });
    try {
      const updated = await productService.reactivateProduct(id);
      set((state) => {
        const i = state.products.items.findIndex((p) => p.id === id);
        if (i !== -1) state.products.items[i] = updated;
        state.products.loading = false;
      });
      void get().subscription.refreshUsage();
    } catch (e) {
      set((state) => {
        state.products.error = (e as Error).message;
        state.products.loading = false;
      });
    }
  },

  clearError: () =>
    set((state) => {
      state.products.error = null;
    }),
  clearTierLimitError: () =>
    set((state) => {
      state.products.tierLimitError = null;
    }),
  reset: () =>
    set((state) => {
      state.products.items = [];
      state.products.loaded = false;
      state.products.loading = false;
      state.products.error = null;
      state.products.tierLimitError = null;
    }),
});
