import { useGlobalStore } from "@shared/state/hooks/useGlobalStore";
import type { ProductSlice } from "@shared/state/slices/products/productSlice";

export function useProductSlice(): ProductSlice;
export function useProductSlice<T>(selector: (state: ProductSlice) => T): T;
export function useProductSlice<T = ProductSlice>(
  selector?: (state: ProductSlice) => T,
): T {
  return useGlobalStore((state) => {
    const slice = state.products;
    return selector ? selector(slice) : (slice as T);
  });
}
