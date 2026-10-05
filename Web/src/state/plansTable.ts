import type { PageWindow, Plan } from "@shared/core/types";
import planService from "@shared/modules/admin/plans/services/PlanService";
import { sharedRowMatchesFilter } from "@shared/shared/lib/branchFilter";
import { createPagedStore, readEveryPage, type PagedQuery } from "./createPagedStore";

export type PlanFilters = Record<string, never>;

function readPlanPage(query: PagedQuery<PlanFilters>, window: PageWindow) {
  return planService.getPlanPage({ ...window, search: query.search, branch: query.branch });
}

export const usePlansTable = createPagedStore<Plan, PlanFilters>(
  readPlanPage,
  {},
  { fits: (plan, query) => sharedRowMatchesFilter(plan.branchId, query.branch) },
);

export function readAllPlans(query: PagedQuery<PlanFilters>): Promise<Plan[]> {
  return readEveryPage(readPlanPage, query);
}
