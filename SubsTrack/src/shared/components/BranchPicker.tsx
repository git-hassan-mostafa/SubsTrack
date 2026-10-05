import { useTranslation } from "react-i18next";
import { Dropdown, type DropdownOption } from "./Dropdown";
import { useActiveBranches } from "@shared/modules/admin/branches/hooks/useActiveBranches";
import { useCanPickBranch } from "@shared/modules/admin/branches/hooks/useCanPickBranch";

interface BranchPickerProps {
  value: string | null;
  onChange: (branchId: string | null) => void;
  label?: string;
  nullLabel: string;
  nullSublabel?: string;
  nullable?: boolean;
}

// NULL means something different per form, so each caller names it via `nullLabel`.
export function BranchPicker({
  value,
  onChange,
  label,
  nullLabel,
  nullSublabel,
  nullable = true,
}: BranchPickerProps) {
  const { t } = useTranslation();
  const activeBranches = useActiveBranches();
  const canPick = useCanPickBranch();

  if (!canPick) return null;

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
      searchable
    />
  );
}
