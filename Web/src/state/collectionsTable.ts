import type { CollectionListItem, PageWindow } from "@shared/core/types";
import { collectionService } from "@shared/modules/ledger/services/CollectionService";
import {
  collectionFindOptions,
  defaultCollectionFilters,
  type CollectionFilterChoice,
} from "@shared/modules/ledger/utils/collectionFilters";
import {
  createPagedStoreWithMeta,
  withPeriodTotal,
  type PagedQuery,
  type PeriodTotal,
} from "./createPagedStore";

function readCollectionPage(query: PagedQuery<CollectionFilterChoice>, window: PageWindow) {
  const options = collectionFindOptions(query.filters, query.branch, query.search);
  return withPeriodTotal(
    collectionService.getHistoryPage({ ...options, ...window }),
    () => collectionService.getMonthlyTotals(options),
    query.filters.status === "voided",
  );
}

export const useCollectionsTable = createPagedStoreWithMeta<
  CollectionListItem,
  CollectionFilterChoice,
  PeriodTotal
>(readCollectionPage, defaultCollectionFilters(), null, { rereadOnOpen: true });

// A payment saved from outside the page dates it; it re-reads once shown.
export function markCollectionsTableStale(): void {
  useCollectionsTable.getState().markStale();
}
