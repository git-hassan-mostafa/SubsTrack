import type { Product } from "@shared/core/types";
import {
  canSaveCatalogItem,
  catalogItemDraftOf,
  catalogItemInput,
  type CatalogItemDraft,
} from "@shared/core/utils/catalogItemDraft";
import type { ProductInput } from "@shared/modules/admin/products/utils/types";

export type ProductDraft = CatalogItemDraft & {
  costPrice: number | null;
  costCurrencyId: string | null;
  initialStock: string;
};

export function productDraftOf(product: Product | null, newBranchId: string | null): ProductDraft {
  return {
    ...catalogItemDraftOf(product, newBranchId),
    costPrice: product?.costPrice ?? null,
    costCurrencyId: product?.costCurrencyId ?? null,
    initialStock: "",
  };
}

export const canSaveProduct = canSaveCatalogItem;

export function productInput(draft: ProductDraft): ProductInput {
  return {
    ...catalogItemInput(draft),
    costPrice: draft.costPrice,
    costCurrencyId: draft.costCurrencyId,
  };
}

// Stock is typed once on create; after that only a stock entry changes it.
export function newProductInput(draft: ProductDraft): ProductInput {
  return { ...productInput(draft), initialStock: Number(draft.initialStock) || 0 };
}
