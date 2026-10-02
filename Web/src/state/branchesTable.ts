import type { ActiveFilter, Branch, PageWindow } from "@shared/core/types";
import branchService from "@shared/modules/admin/branches/services/BranchService";
import type { BranchPageQuery } from "@shared/modules/admin/branches/utils/types";
import { matchesActiveFilter } from "@shared/core/utils/activeFilter";
import { readAllPages } from "@shared/shared/hooks/loadAllPages";
import {
  createPagedStore,
  EXPORT_PAGE_SIZE,
  pageWindow,
  type PagedQuery,
} from "./createPagedStore";

export interface BranchFilters {
  status: ActiveFilter;
}

function toBranchQuery(query: PagedQuery<BranchFilters>, window: PageWindow): BranchPageQuery {
  return { ...window, search: query.search, status: query.filters.status };
}

export const useBranchesTable = createPagedStore<Branch, BranchFilters>(
  (query) => branchService.getBranchPage(toBranchQuery(query, pageWindow(query))),
  { status: "all" },
  { fits: (branch, query) => matchesActiveFilter(branch.active, query.filters.status) },
);

export function readAllBranches(query: PagedQuery<BranchFilters>): Promise<Branch[]> {
  return readAllPages(
    (window) => branchService.getBranchPage(toBranchQuery(query, window)),
    EXPORT_PAGE_SIZE,
  );
}
