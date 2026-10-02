import type { ActiveFilter } from "@shared/core/types";

export function matchesActiveFilter(active: boolean, filter: ActiveFilter): boolean {
  return filter === "all" || active === (filter === "active");
}
