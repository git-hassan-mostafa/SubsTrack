import { useTranslation } from "react-i18next";
import { useActiveBranches } from "@shared/modules/admin/branches/hooks/useActiveBranches";
import { useCanPickBranch } from "@shared/modules/admin/branches/hooks/useCanPickBranch";
import { useBranchSlice } from "@shared/state/hooks/useBranchSlice";
import { SearchableSelect, type SelectOption } from "./SearchableSelect";

interface BranchPickerProps {
  value: string | null;
  onChange: (branchId: string | null) => void;
  nullLabel: string;
  nullable?: boolean;
  label?: string;
}

// Hidden for branch-scoped users and single-branch tenants, like the phone's.
export function BranchPicker({
  value,
  onChange,
  nullLabel,
  nullable = true,
  label,
}: BranchPickerProps) {
  const { t } = useTranslation();
  const activeBranches = useActiveBranches();
  const branches = useBranchSlice((s) => s.items);
  const canPick = useCanPickBranch();

  if (!canPick) return null;

  const inactiveCurrent =
    value !== null && !activeBranches.some((branch) => branch.id === value)
      ? branches.find((branch) => branch.id === value)
      : undefined;

  const options: SelectOption<string>[] = activeBranches.map((branch) => ({
    value: branch.id,
    label: branch.name,
  }));
  if (inactiveCurrent) {
    options.push({
      value: inactiveCurrent.id,
      label: `${inactiveCurrent.name} · ${t("common.inactive")}`,
      disabled: true,
    });
  }

  return (
    <SearchableSelect<string>
      label={label ?? t("branches.branch_label")}
      value={value}
      onChange={onChange}
      options={options}
      nullOption={
        nullable || value === null ? { label: nullLabel, disabled: !nullable } : undefined
      }
      required={!nullable}
      fullWidth
    />
  );
}
