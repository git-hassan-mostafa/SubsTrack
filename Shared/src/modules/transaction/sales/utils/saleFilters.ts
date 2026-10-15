import type { BranchFilter } from "@shared/core/constants";
import type { FindSalesOptions } from "./types";

// `live` is the unfiltered state: a voided sale shows only when asked for.
export type SaleStatus = "live" | "voided" | "all";

export interface SaleFilterChoice {
  customerId: string | null;
  productIds: readonly string[];
  fromDate: string | null;
  toDate: string | null;
  status: SaleStatus;
}

export const SALE_STATUS_LABEL_KEYS: Record<SaleStatus, string> = {
  live: "sales.status_live",
  voided: "sales.status_voided",
  all: "sales.status_all",
};

export function defaultSaleFilters(): SaleFilterChoice {
  return {
    customerId: null,
    productIds: [],
    fromDate: null,
    toDate: null,
    status: "live",
  };
}

export function hasSaleFilter(choice: SaleFilterChoice): boolean {
  return (
    !!choice.customerId ||
    choice.productIds.length > 0 ||
    !!choice.fromDate ||
    !!choice.toDate ||
    choice.status !== "live"
  );
}

// The read both apps send for one filter choice; paging is added by the caller.
export function saleFindOptions(
  choice: SaleFilterChoice,
  branchFilter: BranchFilter,
  search: string,
): Omit<FindSalesOptions, "page"> {
  return {
    searchQuery: search.trim() || undefined,
    branchFilter,
    customerId: choice.customerId,
    productIds: choice.productIds,
    fromDate: choice.fromDate,
    toDate: choice.toDate,
    includeVoided: choice.status !== "live",
    voidedOnly: choice.status === "voided",
  };
}
