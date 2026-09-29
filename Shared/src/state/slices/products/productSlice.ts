import type { StateCreator } from "zustand";
import type { Currency, Product } from "@shared/core/types";
import productService from "@shared/modules/admin/products/services/ProductService";
import type { ProductInput, RestockEntry } from "@shared/modules/admin/products/utils/types";
import { resolveBranchFilter } from "@shared/shared/lib/branchFilter";
import type { GlobalState } from "@shared/state/globalStore";
import { currentDataEpoch, isStaleEpoch } from "@shared/shared/lib/dataEpoch";

type StockCost = { unitCost: number | null; currency: Currency | null };

// The stock actions resolve to the product's new on-hand count, null on failure.
export interface ProductSlice {
  items: Product[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  getProducts: () => Promise<void>;
  fetchProducts: () => Promise<void>;
  createProduct: (
    data: ProductInput,
    tenantId: string,
    userId?: string | null,
    costCurrency?: Currency | null,
  ) => Promise<Product | null>;
  updateProduct: (id: string, data: ProductInput) => Promise<Product | null>;
  applyStockDelta: (deltaByProduct: Record<string, number>) => void;
  addStock: (
    id: string,
    tenantId: string,
    quantity: number,
    note?: string | null,
    userId?: string | null,
    cost?: StockCost | null,
  ) => Promise<number | null>;
  updateStockMovement: (
    movementId: string,
    input: {
      quantity: number;
      note?: string | null;
      cost?: StockCost | null;
    },
  ) => Promise<number | null>;
  revertStockMovement: (
    movementId: string,
    userId?: string | null,
  ) => Promise<number | null>;
  batchRestock: (
    entries: RestockEntry[],
    tenantId: string,
    note?: string | null,
    userId?: string | null,
    currency?: Currency | null,
  ) => Promise<boolean>;
  deleteProduct: (id: string) => Promise<"hard" | "soft" | null>;
  bulkDeleteProducts: (ids: string[]) => Promise<boolean>;
  reactivateProduct: (id: string) => Promise<Product | null>;
  clearError: () => void;
  reset: () => void;
}

export const createProductSlice: StateCreator<
  GlobalState,
  [["zustand/immer", never]],
  [],
  ProductSlice
> = (set, get) => {
  const startWrite = () =>
    set((state) => {
      state.products.loading = true;
      state.products.error = null;
    });

  const failWrite = (e: unknown) =>
    set((state) => {
      state.products.error = (e as Error).message;
      state.products.loading = false;
    });

  const patchOnHand = (productId: string, onHand: number) =>
    set((state) => {
      const i = state.products.items.findIndex((p) => p.id === productId);
      if (i !== -1) state.products.items[i].stockOnHand = onHand;
      state.products.loading = false;
    });

  const replaceItem = (product: Product) =>
    set((state) => {
      const i = state.products.items.findIndex((p) => p.id === product.id);
      if (i !== -1) state.products.items[i] = product;
      state.products.loading = false;
    });

  return {
    items: [],
    loaded: false,
    loading: false,
    error: null,
    getProducts: async () => {
      const { loaded, loading } = get().products;
      if (loaded || loading) return;
      await get().products.fetchProducts();
    },
    fetchProducts: async () => {
      const epoch = currentDataEpoch();
      set((state) => {
        state.products.loading = true;
        state.products.error = null;
      });
      try {
        const branchFilter = resolveBranchFilter(get().auth.user);
        const items = await productService.getProducts(branchFilter);
        if (isStaleEpoch(epoch)) return;
        set((state) => {
          state.products.items = items;
          state.products.loaded = true;
          state.products.loading = false;
        });
      } catch (e) {
        if (isStaleEpoch(epoch)) return;
        failWrite(e);
      }
    },

    createProduct: async (data, tenantId, userId, costCurrency = null) => {
      startWrite();
      try {
        const product = await productService.createProduct(
          data,
          tenantId,
          userId ?? get().auth.user?.id ?? null,
          costCurrency,
        );
        set((state) => {
          state.products.items.unshift(product);
          state.products.loading = false;
        });
        return product;
      } catch (e) {
        failWrite(e);
        return null;
      }
    },

    updateProduct: async (id, data) => {
      startWrite();
      try {
        const updated = await productService.updateProduct(id, data);
        replaceItem(updated);
        return updated;
      } catch (e) {
        failWrite(e);
        return null;
      }
    },

    applyStockDelta: (deltaByProduct) =>
      set((state) => {
        for (const p of state.products.items) {
          const delta = deltaByProduct[p.id];
          if (delta) p.stockOnHand += delta;
        }
      }),

    addStock: async (
      id,
      tenantId,
      quantity,
      note = null,
      userId = null,
      cost = null,
    ) => {
      startWrite();
      try {
        const onHand = await productService.addStock(
          id,
          tenantId,
          quantity,
          note,
          userId,
          cost,
        );
        patchOnHand(id, onHand);
        return onHand;
      } catch (e) {
        failWrite(e);
        return null;
      }
    },

    updateStockMovement: async (movementId, input) => {
      startWrite();
      try {
        const { movement, onHand } = await productService.updateMovement(
          movementId,
          input,
        );
        patchOnHand(movement.productId, onHand);
        return onHand;
      } catch (e) {
        failWrite(e);
        return null;
      }
    },

    revertStockMovement: async (movementId, userId = null) => {
      startWrite();
      try {
        const { productId, onHand } = await productService.revertMovement(
          movementId,
          userId,
        );
        patchOnHand(productId, onHand);
        return onHand;
      } catch (e) {
        failWrite(e);
        return null;
      }
    },

    batchRestock: async (
      entries,
      tenantId,
      note = null,
      userId = null,
      currency = null,
    ) => {
      if (entries.length === 0) return true;
      startWrite();
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
        failWrite(e);
        return false;
      }
    },

    deleteProduct: async (id) => {
      startWrite();
      try {
        const mode = await productService.deleteProduct(id);
        set((state) => {
          if (mode === "hard") {
            state.products.items = state.products.items.filter(
              (p) => p.id !== id,
            );
          } else {
            const i = state.products.items.findIndex((p) => p.id === id);
            if (i !== -1) state.products.items[i].active = false;
          }
          state.products.loading = false;
        });
        return mode;
      } catch (e) {
        failWrite(e);
        return null;
      }
    },

    bulkDeleteProducts: async (ids) => {
      if (ids.length === 0) return true;
      startWrite();
      try {
        const { hard, soft } = await productService.deleteManyProducts(ids);
        set((state) => {
          const removed = new Set(hard);
          const softened = new Set(soft);
          state.products.items = state.products.items.filter(
            (p) => !removed.has(p.id),
          );
          for (const p of state.products.items) {
            if (softened.has(p.id)) p.active = false;
          }
          state.products.loading = false;
        });
        return true;
      } catch (e) {
        failWrite(e);
        return false;
      }
    },

    reactivateProduct: async (id) => {
      startWrite();
      try {
        const updated = await productService.reactivateProduct(id);
        replaceItem(updated);
        return updated;
      } catch (e) {
        failWrite(e);
        return null;
      }
    },

    clearError: () =>
      set((state) => {
        state.products.error = null;
      }),
    reset: () =>
      set((state) => {
        state.products.items = [];
        state.products.loaded = false;
        state.products.loading = false;
        state.products.error = null;
      }),
  };
};
