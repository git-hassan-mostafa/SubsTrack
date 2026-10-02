import type { ActiveFilter, PageWindow, Service } from "@shared/core/types";
import serviceCatalogService from "@shared/modules/admin/service-catalog/services/ServiceCatalogService";
import type { ServicePageQuery } from "@shared/modules/admin/service-catalog/utils/types";
import { matchesActiveFilter } from "@shared/core/utils/activeFilter";
import { readAllPages } from "@shared/shared/hooks/loadAllPages";
import { sharedRowMatchesFilter } from "@shared/shared/lib/branchFilter";
import {
  createPagedStore,
  EXPORT_PAGE_SIZE,
  pageWindow,
  type PagedQuery,
} from "./createPagedStore";

export interface ServiceFilters {
  status: ActiveFilter;
}

function toServiceQuery(
  query: PagedQuery<ServiceFilters>,
  window: PageWindow,
): ServicePageQuery {
  return {
    ...window,
    search: query.search,
    status: query.filters.status,
    branch: query.branch,
  };
}

export const useServicesTable = createPagedStore<Service, ServiceFilters>(
  (query) => serviceCatalogService.getServicePage(toServiceQuery(query, pageWindow(query))),
  { status: "all" },
  {
    fits: (service, query) =>
      sharedRowMatchesFilter(service.branchId, query.branch) &&
      matchesActiveFilter(service.active, query.filters.status),
  },
);

export function readAllServices(query: PagedQuery<ServiceFilters>): Promise<Service[]> {
  return readAllPages(
    (window) => serviceCatalogService.getServicePage(toServiceQuery(query, window)),
    EXPORT_PAGE_SIZE,
  );
}
