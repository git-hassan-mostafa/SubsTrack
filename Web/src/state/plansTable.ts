import type { PageWindow, Plan } from "@shared/core/types";
import planService from "@shared/modules/admin/plans/services/PlanService";
import type { PlanPageQuery } from "@shared/modules/admin/plans/utils/types";
import { readAllPages } from "@shared/shared/hooks/loadAllPages";
import {
  createPagedStore,
  EXPORT_PAGE_SIZE,
  pageWindow,
  type PagedQuery,
} from "./createPagedStore";

export type PlanFilters = Record<string, never>;

function toPlanQuery(query: PagedQuery<PlanFilters>, window: PageWindow): PlanPageQuery {
  return { ...window, search: query.search, branch: query.branch };
}

export const usePlansTable = createPagedStore<Plan, PlanFilters>(
  (query) => planService.getPlanPage(toPlanQuery(query, pageWindow(query))),
  {},
);

export function readAllPlans(query: PagedQuery<PlanFilters>): Promise<Plan[]> {
  return readAllPages(
    (window) => planService.getPlanPage(toPlanQuery(query, window)),
    EXPORT_PAGE_SIZE,
  );
}
