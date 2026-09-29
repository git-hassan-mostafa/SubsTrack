import type { ActiveFilter, PageWindow, Product } from "@shared/core/types";
import productService from "@shared/modules/admin/products/services/ProductService";
import type { ProductPageQuery } from "@shared/modules/admin/products/utils/types";
import { readAllPages } from "@shared/shared/hooks/loadAllPages";
import {
  createPagedStore,
  EXPORT_PAGE_SIZE,
  pageWindow,
  type PagedQuery,
} from "./createPagedStore";

export interface ProductFilters {
  status: ActiveFilter;
}

function toProductQuery(
  query: PagedQuery<ProductFilters>,
  window: PageWindow,
): ProductPageQuery {
  return {
    ...window,
    search: query.search,
    status: query.filters.status,
    branch: query.branch,
  };
}

export const useProductsTable = createPagedStore<Product, ProductFilters>(
  (query) => productService.getProductPage(toProductQuery(query, pageWindow(query))),
  { status: "all" },
);

export function readAllProducts(query: PagedQuery<ProductFilters>): Promise<Product[]> {
  return readAllPages(
    (window) => productService.getProductPage(toProductQuery(query, window)),
    EXPORT_PAGE_SIZE,
  );
}

// A stock write from outside the page (a quick action) re-reads an open table.
export function reloadProductsTableIfLoaded(): void {
  const table = useProductsTable.getState();
  if (table.loaded) void table.load();
}
