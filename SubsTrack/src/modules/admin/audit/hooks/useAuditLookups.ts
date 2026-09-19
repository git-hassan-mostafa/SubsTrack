import { useEffect, useMemo } from "react";
import { useBranchSlice } from "@/src/state/hooks/useBranchSlice";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { usePlanSlice } from "@/src/state/hooks/usePlanSlice";
import { useUserNames } from "@/src/shared/hooks/useUserNames";
import type { AuditLookups } from "../utils/valueDisplay";

/** Every `getX()` self-guards on its `loaded` flag, so calling all three is free. */
export function useAuditLookups(): AuditLookups {
  const user = useUserNames();
  const currencies = useCurrencySlice((s) => s.items);
  const branches = useBranchSlice((s) => s.items);
  const plans = usePlanSlice((s) => s.items);
  const getCurrencies = useCurrencySlice((s) => s.getCurrencies);
  const getBranches = useBranchSlice((s) => s.getBranches);
  const getPlans = usePlanSlice((s) => s.getPlans);

  useEffect(() => {
    void getCurrencies();
    void getBranches();
    void getPlans();
  }, [getCurrencies, getBranches, getPlans]);

  return useMemo<AuditLookups>(() => {
    const currencyById = new Map(currencies.map((c) => [c.id, c]));
    const branchNames = new Map(branches.map((b) => [b.id, b.name]));
    const planNames = new Map(plans.map((p) => [p.id, p.name]));
    return {
      user,
      currency: (id) => currencyById.get(id)?.code ?? null,
      currencyObject: (id) => (id ? (currencyById.get(id) ?? null) : null),
      branch: (id) => branchNames.get(id) ?? null,
      plan: (id) => planNames.get(id) ?? null,
    };
  }, [user, currencies, branches, plans]);
}
