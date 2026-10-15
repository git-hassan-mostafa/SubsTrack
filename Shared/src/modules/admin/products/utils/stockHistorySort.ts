import type { StockMovement } from "@shared/core/types";
import type { SortDirection } from "@shared/modules/ledger/repository/ICollectionRepository";

export type StockHistorySortField = "occurred_at" | "created_at";

export const STOCK_HISTORY_SORT_LABEL_KEYS: Record<StockHistorySortField, string> = {
  occurred_at: "products.sort_by_date",
  created_at: "common.entered_at",
};

const FIELD: Record<StockHistorySortField, "occurredAt" | "createdAt"> = {
  occurred_at: "occurredAt",
  created_at: "createdAt",
};

function timeOf(movement: StockMovement, field: StockHistorySortField): number {
  return Date.parse(movement[FIELD[field]]);
}

// Ties fall back to the other date, then the id, so equal times never swap places.
export function sortStockHistory(
  history: readonly StockMovement[],
  field: StockHistorySortField,
  direction: SortDirection,
): StockMovement[] {
  const other: StockHistorySortField =
    field === "occurred_at" ? "created_at" : "occurred_at";
  const sign = direction === "asc" ? 1 : -1;
  return [...history].sort(
    (a, b) =>
      sign *
      (timeOf(a, field) - timeOf(b, field) ||
        timeOf(a, other) - timeOf(b, other) ||
        a.id.localeCompare(b.id)),
  );
}
