import type { ActiveFilter, PageWindow } from "@shared/core/types";

export type BranchInput = {
  name: string;
};

export interface BranchPageQuery extends PageWindow {
  search: string;
  status: ActiveFilter;
}
