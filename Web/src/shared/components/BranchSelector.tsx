import { useTranslation } from "react-i18next";
import AccountTreeOutlined from "@mui/icons-material/AccountTreeOutlined";
import InputAdornment from "@mui/material/InputAdornment";
import { BRANCH_FILTER_UNASSIGNED } from "@shared/core/constants";
import { useActiveBranches } from "@shared/modules/admin/branches/hooks/useActiveBranches";
import { useCanPickBranch } from "@shared/modules/admin/branches/hooks/useCanPickBranch";
import { useUiPrefStore } from "@shared/shared/lib/uiPrefStore";
import { SearchableSelect, type SelectOption } from "./SearchableSelect";

// Tenant-wide users with 2+ active branches only; RLS pins everyone else.
export function BranchSelector() {
  const { t } = useTranslation();
  const activeBranches = useActiveBranches();
  const canPick = useCanPickBranch();
  const currentBranchId = useUiPrefStore((s) => s.currentBranchId);
  const setCurrentBranchId = useUiPrefStore((s) => s.setCurrentBranchId);

  if (!canPick) return null;

  const filtered = currentBranchId !== null;
  const options: SelectOption<string>[] = [
    ...activeBranches.map((branch) => ({ value: branch.id, label: branch.name })),
    { value: BRANCH_FILTER_UNASSIGNED, label: t("branches.unassigned") },
  ];

  return (
    <SearchableSelect<string>
      size="small"
      ariaLabel={t("branches.branch_label")}
      value={currentBranchId}
      onChange={setCurrentBranchId}
      options={options}
      nullOption={{ label: t("branches.all_branches") }}
      startAdornment={
        <InputAdornment position="start">
          <AccountTreeOutlined fontSize="small" color={filtered ? "primary" : "action"} />
        </InputAdornment>
      }
      sx={{
        width: { xs: 160, sm: 220 },
        "& .MuiInputBase-root": { bgcolor: filtered ? "primary.light" : "background.paper" },
        "& .MuiInputBase-input": { fontWeight: filtered ? 600 : 400 },
      }}
    />
  );
}
