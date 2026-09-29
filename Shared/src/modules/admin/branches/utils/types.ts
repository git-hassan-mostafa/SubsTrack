import type { PageWindow } from "@shared/core/types";

export type BranchInput = {
  name: string;
};

export type BranchStatusFilter = "all" | "active" | "inactive";

export interface BranchPageQuery extends PageWindow {
  search: string;
  status: BranchStatusFilter;
}
