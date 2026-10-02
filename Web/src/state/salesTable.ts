import type { Sale } from "@shared/core/types";
import saleService from "@shared/modules/transaction/sales/services/SaleService";
import {
  defaultSaleFilters,
  saleFindOptions,
  type SaleFilterChoice,
} from "@shared/modules/transaction/sales/utils/saleFilters";
import {
  createPagedStoreWithMeta,
  pageWindow,
  type PagedQuery,
  type PagedResult,
  type PagedStore,
  type PeriodTotal,
} from "./createPagedStore";

export type SalesTable = PagedStore<Sale, SaleFilterChoice, PeriodTotal>;

function salePageReader(customerId: string | null) {
  return async (query: PagedQuery<SaleFilterChoice>): Promise<PagedResult<Sale, PeriodTotal>> => {
    const scoped = customerId ? { ...query.filters, customerId } : query.filters;
    const options = saleFindOptions(scoped, query.branch, query.search);
    const [page, monthly] = await Promise.all([
      saleService.getSalePage({ ...options, ...pageWindow(query) }),
      query.filters.status === "voided" ? null : saleService.getMonthlyTotals(options),
    ]);
    const totalUsd = monthly ? Object.values(monthly).reduce((sum, value) => sum + value, 0) : null;
    return { ...page, meta: totalUsd };
  };
}

// A customer's own sales page builds one per customer; it dies with the page.
export function createSalesTable(customerId: string | null): SalesTable {
  return createPagedStoreWithMeta<Sale, SaleFilterChoice, PeriodTotal>(
    salePageReader(customerId),
    defaultSaleFilters(),
    null,
    { rereadOnOpen: true },
  );
}

export const useSalesTable = createSalesTable(null);

// A payment saved from outside the page (a quick action) re-reads an open table.
export function reloadSalesTableIfLoaded(): void {
  const table = useSalesTable.getState();
  if (table.loaded) void table.load();
}
