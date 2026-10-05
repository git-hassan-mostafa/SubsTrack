import type { ActiveFilter, PageWindow, Service } from "@shared/core/types";
import serviceCatalogService from "@shared/modules/admin/service-catalog/services/ServiceCatalogService";
import { matchesActiveFilter } from "@shared/core/utils/activeFilter";
import { sharedRowMatchesFilter } from "@shared/shared/lib/branchFilter";
import { createPagedStore, readEveryPage, type PagedQuery } from "./createPagedStore";

export interface ServiceFilters {
  status: ActiveFilter;
}

function readServicePage(query: PagedQuery<ServiceFilters>, window: PageWindow) {
  return serviceCatalogService.getServicePage({
    ...window,
    search: query.search,
    status: query.filters.status,
    branch: query.branch,
  });
}

export const useServicesTable = createPagedStore<Service, ServiceFilters>(
  readServicePage,
  { status: "all" },
  {
    fits: (service, query) =>
      sharedRowMatchesFilter(service.branchId, query.branch) &&
      matchesActiveFilter(service.active, query.filters.status),
  },
);

export function readAllServices(query: PagedQuery<ServiceFilters>): Promise<Service[]> {
  return readEveryPage(readServicePage, query);
}
