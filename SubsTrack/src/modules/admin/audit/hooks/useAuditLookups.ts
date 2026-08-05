import { useEffect, useMemo } from 'react';
import { useBranchSlice } from '@/src/state/hooks/useBranchSlice';
import { useCurrencySlice } from '@/src/state/hooks/useCurrencySlice';
import { useUserSlice } from '@/src/state/hooks/useUserSlice';
import type { AuditLookups } from '../utils/valueDisplay';

/**
 * Id → name maps for the trail's id columns (staff, currency, branch), resolved at
 * read time by the display registry.
 *
 * Every `getX()` self-guards on its `loaded` flag, so calling all three costs
 * nothing when the lists are already in the store — needed because a History sheet
 * can open on a screen that loaded none of them.
 */
export function useAuditLookups(): AuditLookups {
  const users = useUserSlice((s) => s.items);
  const currencies = useCurrencySlice((s) => s.items);
  const branches = useBranchSlice((s) => s.items);
  const getUsers = useUserSlice((s) => s.getUsers);
  const getCurrencies = useCurrencySlice((s) => s.getCurrencies);
  const getBranches = useBranchSlice((s) => s.getBranches);

  useEffect(() => {
    void getUsers();
    void getCurrencies();
    void getBranches();
  }, [getUsers, getCurrencies, getBranches]);

  return useMemo<AuditLookups>(() => {
    const userNames = new Map(users.map((u) => [u.id, u.fullName]));
    const currencyCodes = new Map(currencies.map((c) => [c.id, c.code]));
    const branchNames = new Map(branches.map((b) => [b.id, b.name]));
    return {
      user: (id) => userNames.get(id) ?? null,
      currency: (id) => currencyCodes.get(id) ?? null,
      branch: (id) => branchNames.get(id) ?? null,
    };
  }, [users, currencies, branches]);
}
