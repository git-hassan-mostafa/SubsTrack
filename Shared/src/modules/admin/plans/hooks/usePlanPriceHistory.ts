import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlanPriceChange } from "@shared/core/types";
import { priceHistoryService } from "@shared/modules/customer/customer-plans/services/PriceHistoryService";
import {
  changeAt,
  currentBillingMonth,
  sortPlanPriceHistory,
} from "@shared/modules/customer/customer-plans/utils/priceHistory";
import { usePlanSlice } from "@shared/state/hooks/usePlanSlice";

export function usePlanPriceHistory(
  planId: string | undefined | null,
  onUpdated?: () => void,
) {
  const [items, setItems] = useState<PlanPriceChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const updatePriceStartFrom = usePlanSlice((s) => s.updatePriceStartFrom);

  const reload = useCallback(async () => {
    if (!planId) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await priceHistoryService.getForPlan(planId);
      setItems(rows);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const activeChange = useMemo(() => {
    return changeAt(items, currentBillingMonth());
  }, [items]);

  const sortedHistory = useMemo(() => sortPlanPriceHistory(items), [items]);

  const updateFromMonth = useCallback(
    async (changeId: string, fromMonth: string) => {
      if (!planId) return false;
      setError(null);
      setSubmitting(true);
      try {
        const updated = await updatePriceStartFrom(changeId, planId, fromMonth);
        if (updated) {
          setItems((prev) =>
            prev.map((item) => (item.id === updated.id ? updated : item)),
          );
          return true;
        }
        return false;
      } catch (e) {
        setError((e as Error).message);
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [planId, updatePriceStartFrom],
  );

  const startEdit = useCallback((change: PlanPriceChange) => {
    if (!change.fromMonth) return;
    setEditingId(change.id);
    setSelectedMonth(change.fromMonth);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setSelectedMonth("");
  }, []);

  const saveEdit = useCallback(
    async (changeId: string) => {
      if (!selectedMonth) return false;
      const ok = await updateFromMonth(changeId, selectedMonth);
      if (ok) {
        setEditingId(null);
        setSelectedMonth("");
        onUpdated?.();
      }
      return ok;
    },
    [selectedMonth, updateFromMonth, onUpdated],
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    sortedHistory,
    activeChange,
    loading,
    error,
    clearError,
    editingId,
    selectedMonth,
    setSelectedMonth,
    submitting,
    startEdit,
    cancelEdit,
    saveEdit,
  };
}
