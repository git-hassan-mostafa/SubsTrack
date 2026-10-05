import type { ActiveFilter, Branch, PageWindow } from "@shared/core/types";
import branchService from "@shared/modules/admin/branches/services/BranchService";
import { matchesActiveFilter } from "@shared/core/utils/activeFilter";
import { createPagedStore, readEveryPage, type PagedQuery } from "./createPagedStore";

export interface BranchFilters {
  status: ActiveFilter;
}

function readBranchPage(query: PagedQuery<BranchFilters>, window: PageWindow) {
  return branchService.getBranchPage({ ...window, search: query.search, status: query.filters.status });
}

export const useBranchesTable = createPagedStore<Branch, BranchFilters>(
  readBranchPage,
  { status: "all" },
  { fits: (branch, query) => matchesActiveFilter(branch.active, query.filters.status) },
);

export function readAllBranches(query: PagedQuery<BranchFilters>): Promise<Branch[]> {
  return readEveryPage(readBranchPage, query);
}
