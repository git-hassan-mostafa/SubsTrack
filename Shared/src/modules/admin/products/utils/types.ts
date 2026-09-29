import type { BranchFilter } from "@shared/core/constants";
import type { ActiveFilter, PageWindow, Product } from "@shared/core/types";

export type ProductInput = Pick<
  Product,
  | "name"
  | "description"
  | "price"
  | "currencyId"
  | "costPrice"
  | "costCurrencyId"
  | "branchId"
> & {
  initialStock?: number;
  initialStockUnitCost?: number | null;
};

// A null unit cost records the stock with no expense.
export type RestockEntry = {
  productId: string;
  quantity: number;
  unitCost?: number | null;
};

export interface ProductPageQuery extends PageWindow {
  search: string;
  status: ActiveFilter;
  branch: BranchFilter;
}
