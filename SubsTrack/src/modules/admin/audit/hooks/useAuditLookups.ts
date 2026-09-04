import { useEffect, useMemo } from 'react';
import { useBranchSlice } from '@/src/state/hooks/useBranchSlice';
import { useCurrencySlice } from '@/src/state/hooks/useCurrencySlice';
import { usePlanSlice } from '@/src/state/hooks/usePlanSlice';
import { useUserSlice } from '@/src/state/hooks/useUserSlice';
import type { AuditLookups } from '../utils/valueDisplay';

/** Every `getX()` self-guards on its `loaded` flag, so calling all four is free. */
export function useAuditLookups(): AuditLookups {
  const users = useUserSlice((s) => s.items);
  const currencies = useCurrencySlice((s) => s.items);
  const branches = useBranchSlice((s) => s.items);
  const plans = usePlanSlice((s) => s.items);
  const getUsers = useUserSlice((s) => s.getUsers);
  const getCurrencies = useCurrencySlice((s) => s.getCurrencies);
  const getBranches = useBranchSlice((s) => s.getBranches);
  const getPlans = usePlanSlice((s) => s.getPlans);

  useEffect(() => {
    void getUsers();
    void getCurrencies();
    void getBranches();
    void getPlans();
  }, [getUsers, getCurrencies, getBranches, getPlans]);

  return useMemo<AuditLookups>(() => {
    const userNames = new Map(users.map((u) => [u.id, u.fullName]));
    const currencyById = new Map(currencies.map((c) => [c.id, c]));
    const branchNames = new Map(branches.map((b) => [b.id, b.name]));
    const planNames = new Map(plans.map((p) => [p.id, p.name]));
    return {
      user: (id) => userNames.get(id) ?? null,
      currency: (id) => currencyById.get(id)?.code ?? null,
      currencyObject: (id) => (id ? (currencyById.get(id) ?? null) : null),
      branch: (id) => branchNames.get(id) ?? null,
      plan: (id) => planNames.get(id) ?? null,
    };
  }, [users, currencies, branches, plans]);
}
