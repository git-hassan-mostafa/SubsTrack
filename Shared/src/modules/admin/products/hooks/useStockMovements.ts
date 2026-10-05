import { useCallback, useEffect, useState } from "react";
import type { StockMovement } from "@shared/core/types";
import productService from "@shared/modules/admin/products/services/ProductService";

export interface StockMovements {
  history: StockMovement[];
  reload: () => Promise<void>;
}

// A failed re-read keeps the entries already shown rather than blanking the list.
export function useStockMovements(productId: string): StockMovements {
  const [history, setHistory] = useState<StockMovement[]>([]);

  const reload = useCallback(async () => {
    try {
      setHistory(await productService.getMovements(productId));
    } catch {
      return;
    }
  }, [productId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { history, reload };
}
