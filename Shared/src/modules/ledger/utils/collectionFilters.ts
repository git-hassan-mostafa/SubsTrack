import type { BranchFilter } from "@shared/core/constants";
import type { WalletSource } from "@shared/core/types";
import {
  periodFromPreset,
  toRange,
  type ReportPeriod,
} from "@shared/core/utils/dateRange";
import type {
  CollectionSortField,
  FindCollectionsOptions,
  SortDirection,
} from "@shared/modules/ledger/repository/ICollectionRepository";

export type CollectionStatus = "live" | "voided";

export interface CollectionFilterChoice {
  customerId: string | null;
  receivedByUserId: string | null;
  period: ReportPeriod;
  kind: WalletSource | null;
  status: CollectionStatus | null;
  sortField: CollectionSortField;
  sortDirection: SortDirection;
}

export const COLLECTION_KINDS: readonly WalletSource[] = [
  "month",
  "sale",
  "manual",
  "mixed",
];

export const COLLECTION_STATUS_LABEL_KEYS: Record<CollectionStatus, string> = {
  live: "ledger.status_live",
  voided: "ledger.status_voided",
};

export const COLLECTION_SORT_LABEL_KEYS: Record<CollectionSortField, string> = {
  received_at: "ledger.sort_by_received",
  created_at: "ledger.sort_by_recorded",
  updated_at: "ledger.sort_by_updated",
};

export const SORT_DIRECTION_LABEL_KEYS: Record<SortDirection, string> = {
  desc: "ledger.sort_newest",
  asc: "ledger.sort_oldest",
};

// This month, newest first: what Money received opens on and clears back to.
export const defaultCollectionsPeriod = (): ReportPeriod =>
  periodFromPreset("this_month");

export function defaultCollectionFilters(): CollectionFilterChoice {
  return {
    customerId: null,
    receivedByUserId: null,
    period: defaultCollectionsPeriod(),
    kind: null,
    status: null,
    sortField: "received_at",
    sortDirection: "desc",
  };
}

export function hasCollectionFilter(choice: CollectionFilterChoice): boolean {
  return (
    !!choice.customerId ||
    !!choice.receivedByUserId ||
    !!choice.kind ||
    !!choice.status ||
    choice.sortField !== "received_at" ||
    choice.sortDirection !== "desc" ||
    choice.period.preset !== "this_month"
  );
}

// The read both apps send for one filter choice; paging is added by the caller.
export function collectionFindOptions(
  choice: CollectionFilterChoice,
  branchFilter: BranchFilter,
  searchTerm?: string,
): FindCollectionsOptions {
  const range = toRange(choice.period);
  return {
    branchFilter,
    customerId: choice.customerId ?? undefined,
    receivedByUserId: choice.receivedByUserId ?? undefined,
    startIso: range.startIso,
    endExclusiveIso: range.endExclusiveIso,
    kind: choice.kind ?? undefined,
    sortField: choice.sortField,
    sortDirection: choice.sortDirection,
    includeVoided: choice.status !== "live",
    voidedOnly: choice.status === "voided",
    searchTerm: searchTerm || undefined,
  };
}
