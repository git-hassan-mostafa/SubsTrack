import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DataGrid, type GridColDef, type GridValidRowModel } from "@mui/x-data-grid";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "@/state/createPagedStore";
import { actionsColumn } from "./actionsColumn";
import { AUTO_ROW_HEIGHT, gridSx, LOCKED_GRID } from "./gridBase";
import type { TableAction } from "./tableAction";

export type RowTone = "muted" | "highlighted" | null;

interface LocalTableProps<T extends GridValidRowModel & { id: string }> {
  label: string;
  columns: GridColDef<T>[];
  rows: T[];
  rowLabel?: (row: T) => string;
  rowActions?: (row: T) => TableAction[];
  rowBusy?: (row: T) => boolean;
  rowTone?: (row: T) => RowTone;
  autoRowHeight?: boolean;
}

// DataTable's look for rows already in memory (dialogs); pages only past one page.
export function LocalTable<T extends GridValidRowModel & { id: string }>({
  label,
  columns,
  rows,
  rowLabel,
  rowActions,
  rowBusy,
  rowTone,
  autoRowHeight = false,
}: LocalTableProps<T>) {
  const { t } = useTranslation();
  const paged = rows.length > DEFAULT_PAGE_SIZE;

  const allColumns = useMemo<GridColDef<T>[]>(() => {
    if (!rowActions || !rowLabel) return columns;
    return [
      ...columns,
      actionsColumn<T>({ headerName: t("web.table.actions"), rowLabel, rowActions, rowBusy }),
    ];
  }, [columns, rowActions, rowBusy, rowLabel, t]);

  return (
    <DataGrid<T>
      aria-label={label}
      rows={rows}
      columns={allColumns}
      {...LOCKED_GRID}
      disableRowSelectionOnClick
      hideFooter={!paged}
      pageSizeOptions={PAGE_SIZE_OPTIONS}
      initialState={{ pagination: { paginationModel: { pageSize: DEFAULT_PAGE_SIZE } } }}
      getRowHeight={autoRowHeight ? AUTO_ROW_HEIGHT : undefined}
      getRowClassName={(params) => {
        const tone = rowTone?.(params.row);
        return tone ? `row-${tone}` : "";
      }}
      sx={gridSx(autoRowHeight)}
    />
  );
}
