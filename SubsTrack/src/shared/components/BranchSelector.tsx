import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Dropdown, type DropdownOption } from './Dropdown';
import { useActiveBranches } from './BranchPicker';
import { BRANCH_FILTER_UNASSIGNED, type BranchFilter } from '@/src/core/constants';
import { useAuthStore } from '@/src/modules/auth/store/authStore';
import { useUiPrefStore } from '@/src/shared/lib/uiPrefStore';

/**
 * Header branch filter for tenant-wide admins. Sits below PageHeader on
 * Customers / Dashboard / Plans / Users.
 *
 * Self-conceals (returns null) when:
 *   - There is no logged-in user
 *   - The user is branch-scoped (RLS already pins them to their branch)
 *   - The tenant has zero active branches (feature isn't relevant yet)
 *
 * Filter states stored in uiPrefStore.currentBranchId:
 *   null                      → "All Branches" — no filter, see everything
 *   <UUID>                    → that specific branch
 *   BRANCH_FILTER_UNASSIGNED  → only rows with branch_id IS NULL
 */
export function BranchSelector() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const activeBranches = useActiveBranches();
  const currentBranchId = useUiPrefStore((s) => s.currentBranchId);
  const setCurrentBranchId = useUiPrefStore((s) => s.setCurrentBranchId);

  if (!user || user.branchId !== null || activeBranches.length === 0) return null;

  // "Unassigned" is a real option (a non-UUID sentinel), not the null state.
  // null is reserved for "All Branches" and handled by Dropdown's `nullable`.
  const options: DropdownOption<BranchFilter>[] = [
    ...activeBranches.map((b) => ({ value: b.id as BranchFilter, label: b.name })),
    { value: BRANCH_FILTER_UNASSIGNED, label: t('branches.unassigned') },
  ];

  return (
    <View className="bg-white px-4 pt-3 border-b border-gray-100">
      <Dropdown<BranchFilter>
        options={options}
        value={currentBranchId}
        onChange={setCurrentBranchId}
        nullable
        nullLabel={t('branches.all_branches')}
      />
    </View>
  );
}
