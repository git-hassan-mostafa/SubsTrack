import type { GridColDef, GridValidRowModel } from "@mui/x-data-grid";
import { ACTIONS_FIELD } from "./gridBase";
import { RowActionsMenu } from "./RowActionsMenu";
import type { TableAction } from "./tableAction";

interface ActionsColumnOptions<T> {
  headerName: string;
  rowLabel: (row: T) => string;
  rowActions: (row: T) => TableAction[];
  rowBusy?: (row: T) => boolean;
}

// The ⋮ column every web grid ends with.
export function actionsColumn<T extends GridValidRowModel>({
  headerName,
  rowLabel,
  rowActions,
  rowBusy,
}: ActionsColumnOptions<T>): GridColDef<T> {
  return {
    field: ACTIONS_FIELD,
    headerName,
    width: 72,
    align: "center",
    headerAlign: "center",
    sortable: false,
    resizable: false,
    hideable: false,
    renderCell: (params) => (
      <RowActionsMenu
        rowLabel={rowLabel(params.row)}
        actions={rowActions(params.row)}
        tabIndex={params.tabIndex}
        busy={rowBusy?.(params.row) ?? false}
      />
    ),
  };
}
