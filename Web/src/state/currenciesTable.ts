import type { ActiveFilter, Currency, PageWindow } from "@shared/core/types";
import currencyService from "@shared/modules/admin/currencies/services/CurrencyService";
import type { CurrencyPageQuery } from "@shared/modules/admin/currencies/utils/types";
import { matchesActiveFilter } from "@shared/core/utils/activeFilter";
import { readAllPages } from "@shared/shared/hooks/loadAllPages";
import {
  createPagedStore,
  EXPORT_PAGE_SIZE,
  pageWindow,
  type PagedQuery,
} from "./createPagedStore";

export interface CurrencyFilters {
  status: ActiveFilter;
}

function toCurrencyQuery(
  query: PagedQuery<CurrencyFilters>,
  window: PageWindow,
): CurrencyPageQuery {
  return { ...window, search: query.search, status: query.filters.status };
}

export const useCurrenciesTable = createPagedStore<Currency, CurrencyFilters>(
  (query) => currencyService.getCurrencyPage(toCurrencyQuery(query, pageWindow(query))),
  { status: "all" },
  { fits: (currency, query) => matchesActiveFilter(currency.active, query.filters.status) },
);

export function readAllCurrencies(query: PagedQuery<CurrencyFilters>): Promise<Currency[]> {
  return readAllPages(
    (window) => currencyService.getCurrencyPage(toCurrencyQuery(query, window)),
    EXPORT_PAGE_SIZE,
  );
}
