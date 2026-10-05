export type CatalogItemDraft = {
  name: string;
  description: string;
  price: number | null;
  currencyId: string | null;
  branchId: string | null;
};

export function catalogItemDraftOf(
  item: {
    name: string;
    description: string | null;
    price: number;
    currencyId: string | null;
    branchId: string | null;
  } | null,
  newBranchId: string | null,
): CatalogItemDraft {
  return {
    name: item?.name ?? "",
    description: item?.description ?? "",
    price: item?.price ?? null,
    currencyId: item?.currencyId ?? null,
    branchId: item ? item.branchId : newBranchId,
  };
}

export function isPositivePrice(price: number | null): price is number {
  return price !== null && price > 0;
}

export function canSaveCatalogItem(draft: Pick<CatalogItemDraft, "name" | "price">): boolean {
  return draft.name.trim().length > 0 && isPositivePrice(draft.price);
}

export function catalogItemInput(draft: CatalogItemDraft) {
  return {
    name: draft.name,
    description: draft.description.trim() || null,
    price: draft.price ?? 0,
    currencyId: draft.currencyId,
    branchId: draft.branchId,
  };
}
