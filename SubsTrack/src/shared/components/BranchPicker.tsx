import { useTranslation } from "react-i18next";
import { Dropdown, type DropdownOption } from "./Dropdown";
import { useAuthSlice } from "@/src/state/hooks/useAuthSlice";
import { useActiveBranches } from "@/src/modules/branches/hooks/useActiveBranches";
import { useIsMultiBranchActive } from "@/src/modules/branches/hooks/useIsMultiBranchActive";

interface BranchPickerProps {
  value: string | null;
  onChange: (branchId: string | null) => void;
  /** Defaults to t('branches.branch_label'). */
  label?: string;
  /**
   * What "no branch" means in this context. Only surfaced when
   * `nullable !== false`. Required because the semantic differs per entity:
   *   users/admin → "Tenant-wide admin"
   * Customers, plans, and staff users no longer accept a null branch — the
   * picker is rendered with `nullable={false}` in those forms and this label
   * is ignored.
   */
  nullLabel: string;
  nullSublabel?: string;
  /**
   * When false, the picker omits the null option entirely — the user MUST
   * pick a real branch. Defaults to true for backwards compatibility.
   */
  nullable?: boolean;
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
  nullable = true,
}: BranchPickerProps) {
  const { t } = useTranslation();
  const user = useAuthSlice((s) => s.user);
  const activeBranches = useActiveBranches();
  const isMultiBranchActive = useIsMultiBranchActive();

  if (!user || user.branchId !== null || !isMultiBranchActive) return null;

  const options: DropdownOption<string>[] = activeBranches.map((b) => ({
    value: b.id,
    label: b.name,
  }));

  const resolvedLabel = label ?? t("branches.branch_label");

  return (
    <Dropdown
      label={resolvedLabel}
      placeholder={nullable ? nullLabel : resolvedLabel}
      options={options}
      value={value}
      onChange={onChange}
      nullable={nullable}
      nullLabel={nullable ? nullLabel : undefined}
      nullSublabel={nullable ? nullSublabel : undefined}
    />
  );
}
