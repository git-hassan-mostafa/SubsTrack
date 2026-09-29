import { useTranslation } from "react-i18next";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import AccountTreeOutlined from "@mui/icons-material/AccountTreeOutlined";
import InputAdornment from "@mui/material/InputAdornment";
import { BRANCH_FILTER_UNASSIGNED } from "@shared/core/constants";
import { useActiveBranches } from "@shared/modules/admin/branches/hooks/useActiveBranches";
import { useIsMultiBranchActive } from "@shared/modules/admin/branches/hooks/useIsMultiBranchActive";
import { useAuthSlice } from "@shared/state/hooks/useAuthSlice";
import { useUiPrefStore } from "@shared/shared/lib/uiPrefStore";

const ALL_BRANCHES = "";

// Tenant-wide users with 2+ active branches only; RLS pins everyone else.
export function BranchSelector() {
  const { t } = useTranslation();
  const user = useAuthSlice((s) => s.user);
  const activeBranches = useActiveBranches();
  const isMultiBranchActive = useIsMultiBranchActive();
  const currentBranchId = useUiPrefStore((s) => s.currentBranchId);
  const setCurrentBranchId = useUiPrefStore((s) => s.setCurrentBranchId);

  if (!user || user.branchId !== null || !isMultiBranchActive) return null;

  const filtered = currentBranchId !== null;

  return (
    <Select
      size="small"
      value={currentBranchId ?? ALL_BRANCHES}
      onChange={(event) =>
        setCurrentBranchId(event.target.value === ALL_BRANCHES ? null : event.target.value)
      }
      displayEmpty
      inputProps={{ "aria-label": t("branches.branch_label") }}
      startAdornment={
        <InputAdornment position="start">
          <AccountTreeOutlined fontSize="small" color={filtered ? "primary" : "action"} />
        </InputAdornment>
      }
      sx={{
        minWidth: { xs: 120, sm: 180 },
        bgcolor: filtered ? "primary.light" : "background.paper",
        fontWeight: filtered ? 600 : 400,
      }}
    >
      <MenuItem value={ALL_BRANCHES}>{t("branches.all_branches")}</MenuItem>
      {activeBranches.map((branch) => (
        <MenuItem key={branch.id} value={branch.id}>
          {branch.name}
        </MenuItem>
      ))}
      <MenuItem value={BRANCH_FILTER_UNASSIGNED}>{t("branches.unassigned")}</MenuItem>
    </Select>
  );
}
