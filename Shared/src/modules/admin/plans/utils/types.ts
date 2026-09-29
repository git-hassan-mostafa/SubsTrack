import type { BranchFilter } from "@shared/core/constants";
import type { PageWindow, Plan } from "@shared/core/types";

export type PlanInput = Pick<
  Plan,
  | "name"
  | "isCustomPrice"
  | "price"
  | "durationMonths"
  | "currencyId"
  | "branchId"
>;

export interface PlanPageQuery extends PageWindow {
  search: string;
  branch: BranchFilter;
}
