import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  DataGrid,
  type GridColDef,
  type GridRowSelectionModel,
  type GridValidRowModel,
} from "@mui/x-data-grid";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "@/state/createPagedStore";
import { actionsColumn } from "./actionsColumn";
import { AUTO_ROW_HEIGHT, gridSx, LOCKED_GRID, rowClassName, type RowTone } from "./gridBase";
import { useGridColumns } from "./gridColumns";
import { useTableDensity } from "./tableViews";
import type { TableAction } from "./tableAction";

// The caller owns the picked ids, so it may widen a pick (a whole bundle).
export interface LocalSelection<T> {
  ids: ReadonlySet<string>;
  onChange: (ids: Set<string>) => void;
  isSelectable?: (row: T) => boolean;
}

interface LocalTableProps<T extends GridValidRowModel & { id: string }> {
  label: string;
  columns: GridColDef<T>[];
  rows: T[];
  rowLabel?: (row: T) => string;
  rowActions?: (row: T) => TableAction[];
  rowBusy?: (row: T) => boolean;
  rowTone?: (row: T) => RowTone;
  autoRowHeight?: boolean;
  selection?: LocalSelection<T>;
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
  selection,
}: LocalTableProps<T>) {
  const { t } = useTranslation();
  const paged = rows.length > DEFAULT_PAGE_SIZE;
  const pickedIds = selection?.ids;
  const isSelectable = selection?.isSelectable;
  const selectionModel = useMemo<GridRowSelectionModel>(
    () => ({ type: "include", ids: new Set(pickedIds ?? []) }),
    [pickedIds],
  );

  const allColumns = useMemo<GridColDef<T>[]>(() => {
    if (!rowActions || !rowLabel) return columns;
    return [
      ...columns,
      actionsColumn<T>({ headerName: t("web.table.actions"), rowLabel, rowActions, rowBusy }),
    ];
  }, [columns, rowActions, rowBusy, rowLabel, t]);
  const grid = useGridColumns(allColumns, null);
  const { density } = useTableDensity();

  return (
    <DataGrid<T>
      aria-label={label}
      rows={rows}
      {...grid.gridProps}
      density={density}
      {...LOCKED_GRID}
      disableRowSelectionOnClick
      checkboxSelection={Boolean(selection)}
      disableRowSelectionExcludeModel
      rowSelectionModel={selectionModel}
      onRowSelectionModelChange={(model) => selection?.onChange(new Set([...model.ids].map(String)))}
      isRowSelectable={isSelectable ? (params) => isSelectable(params.row) : undefined}
      hideFooterSelectedRowCount
      hideFooter={!paged}
      pageSizeOptions={PAGE_SIZE_OPTIONS}
      initialState={{ pagination: { paginationModel: { pageSize: DEFAULT_PAGE_SIZE } } }}
      getRowHeight={autoRowHeight ? AUTO_ROW_HEIGHT : undefined}
      getRowClassName={(params) => rowClassName(params.indexRelativeToCurrentPage, rowTone?.(params.row))}
      sx={gridSx(autoRowHeight, density)}
    />
  );
}
