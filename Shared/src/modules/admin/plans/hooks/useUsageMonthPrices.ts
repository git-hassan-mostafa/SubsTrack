import { useCallback, useEffect, useState } from "react";
import type { Plan, PlanPriceChange } from "@shared/core/types";
import {
  canSaveUsagePrices,
  hasUsagePriceEdits,
  usagePriceDraftsOf,
  usagePricesToSave,
  type UsagePriceEdit,
} from "@shared/modules/admin/plans/utils/usageMonthPrices";
import { priceHistoryService } from "@shared/modules/customer/customer-plans/services/PriceHistoryService";
import { currentBillingMonth } from "@shared/modules/customer/customer-plans/utils/priceHistory";
import { usePlanSlice } from "@shared/state/hooks/usePlanSlice";

// Reads every usage plan's prices once; switching month re-derives, never re-reads (#121).
export function useUsageMonthPrices(plans: Plan[], onSaved?: () => void) {
  const usagePlans = plans.filter((plan) => plan.usage);
  const planKey = usagePlans.map((plan) => plan.id).join(",");
  const [changes, setChanges] = useState<PlanPriceChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [month, setMonthState] = useState(currentBillingMonth);
  const [edits, setEdits] = useState<Record<string, UsagePriceEdit>>({});
  const setUsageMonthPrices = usePlanSlice((s) => s.setUsageMonthPrices);
  const saving = usePlanSlice((s) => s.loading);
  const saveError = usePlanSlice((s) => s.error);
  const clearSaveError = usePlanSlice((s) => s.clearError);

  const reload = useCallback(async () => {
    const ids = planKey ? planKey.split(",") : [];
    setLoading(true);
    setLoadError(null);
    try {
      setChanges(await priceHistoryService.getForPlans(ids));
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [planKey]);

  useEffect(() => {
    reload();
  }, [reload]);

  const drafts = usagePriceDraftsOf(usagePlans, changes, month, edits);

  function setMonth(next: string) {
    setMonthState(next);
    setEdits({});
  }

  function edit(planId: string, patch: UsagePriceEdit) {
    setEdits((prev) => ({ ...prev, [planId]: { ...prev[planId], ...patch } }));
    if (saveError) clearSaveError();
  }

  async function save(): Promise<boolean> {
    const prices = usagePricesToSave(drafts);
    if (prices.length === 0) return false;
    const saved = await setUsageMonthPrices(month, prices);
    if (!saved) return false;
    setChanges((prev) => [...prev, ...saved]);
    setEdits({});
    onSaved?.();
    return true;
  }

  function clearError() {
    setLoadError(null);
    clearSaveError();
  }

  return {
    month,
    setMonth,
    drafts,
    edit,
    loading,
    saving,
    error: loadError ?? saveError,
    clearError,
    save,
    canSave: canSaveUsagePrices(drafts) && !saving,
    dirty: hasUsagePriceEdits(drafts),
  };
}
