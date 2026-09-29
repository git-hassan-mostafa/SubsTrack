import { useGlobalStore } from "@shared/state/hooks/useGlobalStore";
import type { SaleSlice } from "@shared/state/slices/sales/saleSlice";

export function useSaleSlice(): SaleSlice;
export function useSaleSlice<T>(selector: (state: SaleSlice) => T): T;
export function useSaleSlice<T = SaleSlice>(
  selector?: (state: SaleSlice) => T,
): T {
  return useGlobalStore((state) => {
    const slice = state.sales;
    return selector ? selector(slice) : (slice as T);
  });
}
