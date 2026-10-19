import { useEffect } from "react";
import type { PlanUsage } from "@shared/core/types";
import { usePlanSlice } from "@shared/state/hooks/usePlanSlice";

// A usage bill names its unit and fee as its plan does; null until the plan list has it.
export function usePlanUsage(planId: string | null): PlanUsage | null {
  const plans = usePlanSlice((s) => s.items);
  const getPlans = usePlanSlice((s) => s.getPlans);

  useEffect(() => {
    if (planId) void getPlans();
  }, [planId, getPlans]);

  if (!planId) return null;
  return plans.find((p) => p.id === planId)?.usage ?? null;
}
