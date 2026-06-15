import { useCallback, useEffect, useRef, useState } from "react";
import { PAGE_SIZE } from "@/src/core/constants";
import type { Sale } from "@/src/core/types";
import saleService from "../services/SaleService";

interface CustomerSalesList {
  items: Sale[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  clearError: () => void;
}

// Presentation-layer hook powering the full customer-scoped sales page.
// It deliberately keeps its own paginated list state (instead of the global
// `sales` slice) so this view never collides with the Sales tab — same reason
// CustomerSalesPanel reads independently. Branch filtering is intentionally NOT
// applied: this page shows every sale for the customer regardless of the
// admin's current branch view.
export function useCustomerSalesList(
  customerId: string | undefined,
  search: string,
): CustomerSalesList {
  const [items, setItems] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageRef = useRef(0);
  const tokenRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!customerId) {
      setItems([]);
      setHasMore(false);
      setLoading(false);
      return;
    }
    const token = ++tokenRef.current;
    pageRef.current = 0;
    setLoading(true);
    setError(null);
    try {
      const rows = await saleService.getSales({
        page: 0,
        customerId,
        searchQuery: search || undefined,
      });
      if (tokenRef.current !== token) return;
      setItems(rows);
      setHasMore(rows.length === PAGE_SIZE);
    } catch (e) {
      if (tokenRef.current !== token) return;
      setError((e as Error).message);
    } finally {
      if (tokenRef.current === token) setLoading(false);
    }
  }, [customerId, search]);

  const loadMore = useCallback(async () => {
    if (!customerId || loading || loadingMore || !hasMore) return;
    const token = tokenRef.current;
    setLoadingMore(true);
    try {
      const nextPage = pageRef.current + 1;
      const rows = await saleService.getSales({
        page: nextPage,
        customerId,
        searchQuery: search || undefined,
      });
      if (tokenRef.current !== token) return;
      pageRef.current = nextPage;
      setItems((prev) => [...prev, ...rows]);
      setHasMore(rows.length === PAGE_SIZE);
    } catch (e) {
      if (tokenRef.current !== token) return;
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }, [customerId, search, loading, loadingMore, hasMore]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const clearError = useCallback(() => setError(null), []);

  return { items, loading, loadingMore, hasMore, error, refresh, loadMore, clearError };
}
