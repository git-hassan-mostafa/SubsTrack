import type { CollectionListItem } from "@shared/core/types";
import { collectionService } from "@shared/modules/ledger/services/CollectionService";
import { periodTotalUsd } from "@shared/modules/ledger/utils/monthTotals";
import {
  collectionFindOptions,
  defaultCollectionFilters,
  type CollectionFilterChoice,
} from "@shared/modules/ledger/utils/collectionFilters";
import {
  createPagedStoreWithMeta,
  pageWindow,
  type PagedQuery,
  type PagedResult,
  type PeriodTotal,
} from "./createPagedStore";

async function readCollectionPage(
  query: PagedQuery<CollectionFilterChoice>,
): Promise<PagedResult<CollectionListItem, PeriodTotal>> {
  const options = collectionFindOptions(query.filters, query.branch, query.search);
  const onlyVoided = query.filters.status === "voided";
  const [page, monthly] = await Promise.all([
    collectionService.getHistoryPage({ ...options, ...pageWindow(query) }),
    onlyVoided ? {} : collectionService.getMonthlyTotals(options),
  ]);
  return { ...page, meta: periodTotalUsd(monthly, onlyVoided) };
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
