import { useEffect, useState } from "react";
import planService from "@shared/modules/admin/plans/services/PlanService";

// A plan with a paid line keeps its prepaid switch; a new plan never locks.
export function usePlanPrepaidLock(planId: string | null | undefined): boolean {
  const [locked, setLocked] = useState<{ planId: string; locked: boolean } | null>(null);

  useEffect(() => {
    if (!planId) return;
    let alive = true;
    void planService
      .hasPaidLine(planId)
      .then((paid) => {
        if (alive) setLocked({ planId, locked: paid });
      })
      .catch(() => {
        if (alive) setLocked({ planId, locked: true });
      });
    return () => {
      alive = false;
    };
  }, [planId]);

  if (!planId) return false;
  return locked?.planId === planId ? locked.locked : true;
}
