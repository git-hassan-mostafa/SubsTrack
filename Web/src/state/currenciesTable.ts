import type { ActiveFilter, Currency, PageWindow } from "@shared/core/types";
import currencyService from "@shared/modules/admin/currencies/services/CurrencyService";
import { matchesActiveFilter } from "@shared/core/utils/activeFilter";
import { createPagedStore, readEveryPage, type PagedQuery } from "./createPagedStore";

export interface CurrencyFilters {
  status: ActiveFilter;
}

function readCurrencyPage(query: PagedQuery<CurrencyFilters>, window: PageWindow) {
  return currencyService.getCurrencyPage({ ...window, search: query.search, status: query.filters.status });
}

export const useCurrenciesTable = createPagedStore<Currency, CurrencyFilters>(
  readCurrencyPage,
  { status: "all" },
  { fits: (currency, query) => matchesActiveFilter(currency.active, query.filters.status) },
);

export function readAllCurrencies(query: PagedQuery<CurrencyFilters>): Promise<Currency[]> {
  return readEveryPage(readCurrencyPage, query);
}
