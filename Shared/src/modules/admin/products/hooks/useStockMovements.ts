import { useCallback, useEffect, useMemo, useState } from "react";
import type { StockMovement } from "@shared/core/types";
import productService from "@shared/modules/admin/products/services/ProductService";
import type { SortDirection } from "@shared/modules/ledger/repository/ICollectionRepository";
import {
  sortStockHistory,
  type StockHistorySortField,
} from "@shared/modules/admin/products/utils/stockHistorySort";

export interface StockMovements {
  history: StockMovement[];
  reload: () => Promise<void>;
  sortField: StockHistorySortField;
  setSortField: (field: StockHistorySortField) => void;
  sortDirection: SortDirection;
  setSortDirection: (direction: SortDirection) => void;
}

// A failed re-read keeps the entries already shown rather than blanking the list.
export function useStockMovements(productId: string): StockMovements {
  const [loaded, setLoaded] = useState<StockMovement[]>([]);
  const [sortField, setSortField] = useState<StockHistorySortField>("occurred_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const reload = useCallback(async () => {
    try {
      setLoaded(await productService.getMovements(productId));
    } catch {
      return;
    }
  }, [productId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const history = useMemo(
    () => sortStockHistory(loaded, sortField, sortDirection),
    [loaded, sortField, sortDirection],
  );

  return {
    history,
    reload,
    sortField,
    setSortField,
    sortDirection,
    setSortDirection,
  };
}
