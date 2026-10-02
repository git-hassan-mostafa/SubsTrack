import type { BranchFilter } from "@shared/core/constants";
import type { Sale } from "@shared/core/types";
import saleService from "@shared/modules/transaction/sales/services/SaleService";
import {
  defaultSaleFilters,
  hasSaleFilter,
  saleFindOptions,
  type SaleFilterChoice,
} from "@shared/modules/transaction/sales/utils/saleFilters";
import { saleUsd } from "@shared/modules/transaction/sales/utils/saleListPatch";
import { ownedRowMatchesFilter } from "@shared/shared/lib/branchFilter";
import { getStore } from "@shared/state/globalStore";
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
  );
}

export const useSalesTable = createSalesTable(null);

const customerTables = new Map<SalesTable, string>();

let saleSaveBump: number | null = null;

const owedVersion = () => getStore().getState().ledger.owedVersion;

function salesTables(): [SalesTable, string | null][] {
  return [[useSalesTable, null], ...customerTables];
}

// A customer's sales page registers its store while open, so writes reach it.
export function trackCustomerSalesTable(table: SalesTable, customerId: string): () => void {
  customerTables.set(table, customerId);
  return () => {
    customerTables.delete(table);
  };
}

export function markSalesTableStale(): void {
  useSalesTable.getState().markStale();
}

// A sale save's own owed bump is skipped: it already patched the tables.
export function markSalesTablesStaleOnOwed(): void {
  if (owedVersion() === saleSaveBump) return;
  for (const [table] of salesTables()) table.getState().markStale();
}

// Armed BEFORE the write: the signal can fire before the save returns.
export async function runSaleSave(save: () => Promise<void>): Promise<void> {
  const expected = owedVersion() + 1;
  saleSaveBump = expected;
  try {
    await save();
  } finally {
    if (owedVersion() < expected) saleSaveBump = null;
  }
}

function inScope(sale: Sale, customerId: string | null, branch: BranchFilter): boolean {
  return customerId ? sale.customerId === customerId : ownedRowMatchesFilter(sale.branchId, branch);
}

// A searched or filtered table re-reads, like the phone: only the server knows.
function patchSaleTable(table: SalesTable, customerId: string | null, saved: Sale, before: Sale | null): void {
  const { loaded, query, meta, markStale, patchRow, addRow, setMeta } = table.getState();
  if (!loaded) return;
  const was = before !== null && inScope(before, customerId, query.branch);
  const is = inScope(saved, customerId, query.branch);
  if (!was && !is) return;
  const filtered = query.search !== "" || hasSaleFilter(query.filters);
  if (filtered || meta === null || (before !== null && was !== is)) {
    markStale();
    return;
  }
  if (before) patchRow(saved);
  else addRow(saved);
  setMeta(meta + saleUsd(saved) - (before ? saleUsd(before) : 0));
}

export function patchSaleTables(saved: Sale, before: Sale | null): void {
  for (const [table, customerId] of salesTables()) patchSaleTable(table, customerId, saved, before);
}
