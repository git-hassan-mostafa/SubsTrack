import type { StateCreator } from 'zustand';
import type { Product, TierPlan, TenantUsage } from '@/src/core/types';
import { productService, type ProductInput } from '@/src/modules/admin/products';
import { resolveBranchFilter } from '@/src/shared/lib/branchFilter';
import { TierLimitError } from '@/src/modules/admin/subscription';
import type { TierLimitErrorPayload } from '@/src/modules/admin/subscription';
import type { GlobalState } from '@/src/state/globalStore';

export interface ProductSlice {
  items: Product[];
  loading: boolean;
  error: string | null;
  tierLimitError: TierLimitErrorPayload | null;
  getProducts: () => Promise<void>;
  fetchProducts: () => Promise<void>;
  createProduct: (data: ProductInput, tenantId: string, tier: TierPlan, usage: TenantUsage) => Promise<void>;
  updateProduct: (id: string, data: ProductInput) => Promise<void>;
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
  loading: false,
  error: null,
  tierLimitError: null,
  getProducts: async () => {
    if (get().products.items.length > 0) return;
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
        state.products.loading = false;
      });
    } catch (e) {
      set((state) => {
        state.products.error = (e as Error).message;
        state.products.loading = false;
      });
    }
  },

  createProduct: async (data, tenantId, tier, usage) => {
    set((state) => {
      state.products.loading = true;
      state.products.error = null;
      state.products.tierLimitError = null;
    });
    try {
      const product = await productService.createProduct(data, tenantId, tier, usage);
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
      state.products.loading = false;
      state.products.error = null;
      state.products.tierLimitError = null;
    }),
});
