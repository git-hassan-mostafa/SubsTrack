import type { PageWindow, Sale } from "@shared/core/types";
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
  withPeriodTotal,
  type PagedQuery,
  type PagedStore,
  type PeriodTotal,
  type RowFit,
} from "./createPagedStore";

export type SalesTable = PagedStore<Sale, SaleFilterChoice, PeriodTotal>;

function salePageReader(customerId: string | null) {
  return (query: PagedQuery<SaleFilterChoice>, window: PageWindow) => {
    const scoped = customerId ? { ...query.filters, customerId } : query.filters;
    const options = saleFindOptions(scoped, query.branch, query.search);
    return withPeriodTotal(
      saleService.getSalePage({ ...options, ...window }),
      () => saleService.getMonthlyTotals(options),
      query.filters.status === "voided",
    );
  };
}

// A searched or filtered table re-reads, like the phone: only the server knows.
function saleFits(customerId: string | null): RowFit<Sale, SaleFilterChoice> {
  return (sale, query) => {
    if (hasSaleFilter(query.filters)) return null;
    return customerId
      ? sale.customerId === customerId
      : ownedRowMatchesFilter(sale.branchId, query.branch);
  };
}

// A customer's own sales page builds one per customer; it dies with the page.
export function createSalesTable(customerId: string | null): SalesTable {
  return createPagedStoreWithMeta<Sale, SaleFilterChoice, PeriodTotal>(
    salePageReader(customerId),
    defaultSaleFilters(),
    null,
    { fits: saleFits(customerId) },
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

// The period total moves only when the row itself was patched or added in place.
function patchSaleTable(table: SalesTable, saved: Sale, before: Sale | null): void {
  const { meta, markStale, patchRow, addRow, setMeta } = table.getState();
  const outcome = before ? patchRow(saved) : addRow(saved);
  if (outcome !== "patched" && outcome !== "added") return;
  if (meta === null) markStale();
  else setMeta(meta + saleUsd(saved) - (before ? saleUsd(before) : 0));
}

export function patchSaleTables(saved: Sale, before: Sale | null): void {
  for (const [table] of salesTables()) patchSaleTable(table, saved, before);
}
