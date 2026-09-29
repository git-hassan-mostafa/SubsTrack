import type { TFunction } from "i18next";
import type { GridColDef, GridValidRowModel } from "@mui/x-data-grid";
import { StatusChip } from "@/shared/components/StatusChip";

export function activeStatusColumn<T extends GridValidRowModel & { active: boolean }>(
  t: TFunction,
): GridColDef<T> {
  return {
    field: "active",
    headerName: t("web.status"),
    width: 140,
    renderCell: (params) =>
      params.row.active ? (
        <StatusChip label={t("common.active")} tone="emerald" />
      ) : (
        <StatusChip label={t("common.inactive")} tone="gray" />
      ),
  };
}
