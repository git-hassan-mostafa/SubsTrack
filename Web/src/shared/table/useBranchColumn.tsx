import { useTranslation } from "react-i18next";
import type { GridColDef, GridValidRowModel } from "@mui/x-data-grid";
import { useIsMultiBranchActive } from "@shared/modules/admin/branches/hooks/useIsMultiBranchActive";
import { useBranchSlice } from "@shared/state/hooks/useBranchSlice";

// Shown only when the tenant has 2+ active branches, like every branch UI.
export function useBranchColumn<T extends GridValidRowModel & { branchId: string | null }>(
  nullLabel: string,
): GridColDef<T> | null {
  const { t } = useTranslation();
  const branches = useBranchSlice((s) => s.items);
  const isMultiBranchActive = useIsMultiBranchActive();
  if (!isMultiBranchActive) return null;
  return {
    field: "branchId",
    headerName: t("branches.branch_label"),
    flex: 1,
    minWidth: 160,
    valueGetter: (_value, row) =>
      branches.find((branch) => branch.id === row.branchId)?.name ?? nullLabel,
  };
}
