import type { ActiveFilter, PageWindow, Product } from "@shared/core/types";
import productService from "@shared/modules/admin/products/services/ProductService";
import { matchesActiveFilter } from "@shared/core/utils/activeFilter";
import { sharedRowMatchesFilter } from "@shared/shared/lib/branchFilter";
import { createPagedStore, readEveryPage, type PagedQuery } from "./createPagedStore";

export interface ProductFilters {
  status: ActiveFilter;
}

function readProductPage(query: PagedQuery<ProductFilters>, window: PageWindow) {
  return productService.getProductPage({
    ...window,
    search: query.search,
    status: query.filters.status,
    branch: query.branch,
  });
}

export const useProductsTable = createPagedStore<Product, ProductFilters>(
  readProductPage,
  { status: "all" },
  {
    fits: (product, query) =>
      sharedRowMatchesFilter(product.branchId, query.branch) &&
      matchesActiveFilter(product.active, query.filters.status),
  },
);

export function readAllProducts(query: PagedQuery<ProductFilters>): Promise<Product[]> {
  return readEveryPage(readProductPage, query);
}

// A stock write from outside the page dates it; it re-reads once shown.
export function markProductsTableStale(): void {
  useProductsTable.getState().markStale();
}
