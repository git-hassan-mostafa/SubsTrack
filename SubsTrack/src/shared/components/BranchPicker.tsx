import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dropdown, type DropdownOption } from './Dropdown';
import { useAuthStore } from '@/src/modules/auth/store/authStore';
import { useBranchStore } from '@/src/modules/branches/store/branchStore';
import type { Branch } from '@/src/core/types';

/**
 * Returns the tenant's active branches, ensuring they've been loaded.
 *
 * Use this when a screen or form needs to react to "does this tenant have
 * any branches?" — for example UserFormSheet enforces "staff users must be
 * assigned to a branch" only when at least one branch exists.
 *
 * Safe to call from multiple components; `getBranches()` short-circuits when
 * the store is already populated.
 */
export function useActiveBranches(): Branch[] {
  const branches = useBranchStore((s) => s.branches);
  const getBranches = useBranchStore((s) => s.getBranches);
  useEffect(() => {
    getBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return branches.filter((b) => b.active);
}

interface BranchPickerProps {
  value: string | null;
  onChange: (branchId: string | null) => void;
  /** Defaults to t('branches.branch_label'). */
  label?: string;
  /**
   * What "no branch" means in this context. Required because the semantic
   * differs per entity:
   *   customers   → "Unassigned"
   *   plans       → "Shared (all branches)"
   *   users/admin → "Tenant-wide admin"
   *   users/staff → "Unassigned"
   */
  nullLabel: string;
  nullSublabel?: string;
}

/**
 * Form-field branch picker. Encapsulates all the boilerplate that previously
 * lived in every FormSheet that touched branches: store subscription, load
 * on mount, visibility decision, option construction.
 *
 * Self-conceals (returns null) when:
 *   - There is no logged-in user
 *   - The user is branch-scoped (their branch is fixed; picker is irrelevant)
 *   - The tenant has zero active branches
 *
 * The semantic of NULL varies per consumer, so callers pass `nullLabel` to
 * describe what "no branch selected" means in their context.
 */
export function BranchPicker({
  value,
  onChange,
  label,
  nullLabel,
  nullSublabel,
}: BranchPickerProps) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const activeBranches = useActiveBranches();

  if (!user || user.branchId !== null || activeBranches.length === 0) return null;

  const options: DropdownOption<string>[] = activeBranches.map((b) => ({
    value: b.id,
    label: b.name,
  }));

  return (
    <Dropdown
      label={label ?? t('branches.branch_label')}
      placeholder={nullLabel}
      options={options}
      value={value}
      onChange={onChange}
      nullable
      nullLabel={nullLabel}
      nullSublabel={nullSublabel}
    />
  );
}
