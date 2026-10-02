import type { Customer, DebtHistoryItem } from "@shared/core/types";
import { chargeService } from "@shared/modules/ledger/services/ChargeService";
import { keyOf } from "@shared/modules/ledger/utils/waterfall";
import {
  DEFAULT_DEBT_HISTORY_FILTERS,
  debtHistoryReadOptions,
  type DebtHistoryFilters,
} from "@shared/modules/transaction/debts/utils/debtHistory";
import { createPagedStore, pageWindow } from "./createPagedStore";

export type DebtHistoryRow = DebtHistoryItem & { id: string };

// The picked customer rides along so the picker can show the name back.
export type DebtHistoryTableFilters = DebtHistoryFilters & { customer: Customer | null };

export const DEFAULT_DEBT_HISTORY_TABLE_FILTERS: DebtHistoryTableFilters = {
  ...DEFAULT_DEBT_HISTORY_FILTERS,
  customer: null,
};

export const useDebtHistoryTable = createPagedStore<DebtHistoryRow, DebtHistoryTableFilters>(
  async (query) => {
    const page = await chargeService.getChargeHistoryPage({
      ...debtHistoryReadOptions(query.filters, query.branch),
      ...pageWindow(query),
    });
    return { rows: page.rows.map((item) => ({ ...item, id: keyOf(item) })), total: page.total };
  },
  DEFAULT_DEBT_HISTORY_TABLE_FILTERS,
);

export function markDebtHistoryTableStale(): void {
  useDebtHistoryTable.getState().markStale();
}
