import { useTranslation } from "react-i18next";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import { useActiveBranches } from "@shared/modules/admin/branches/hooks/useActiveBranches";
import { useCanPickBranch } from "@shared/modules/admin/branches/hooks/useCanPickBranch";
import { useBranchSlice } from "@shared/state/hooks/useBranchSlice";

const NO_BRANCH = "";

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

  return (
    <TextField
      select
      label={label ?? t("branches.branch_label")}
      value={value ?? NO_BRANCH}
      onChange={(event) =>
        onChange(event.target.value === NO_BRANCH ? null : event.target.value)
      }
      required={!nullable}
      fullWidth
    >
      {nullable || value === null ? (
        <MenuItem value={NO_BRANCH} disabled={!nullable}>
          {nullLabel}
        </MenuItem>
      ) : null}
      {activeBranches.map((branch) => (
        <MenuItem key={branch.id} value={branch.id}>
          {branch.name}
        </MenuItem>
      ))}
      {inactiveCurrent ? (
        <MenuItem value={inactiveCurrent.id} disabled>
          {inactiveCurrent.name} · {t("common.inactive")}
        </MenuItem>
      ) : null}
    </TextField>
  );
}
