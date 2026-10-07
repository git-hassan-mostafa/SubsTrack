import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import {
  DataGrid,
  type GridColDef,
  type GridRowId,
  type GridRowSelectionModel,
  type GridValidRowModel,
} from "@mui/x-data-grid";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { EmptyState } from "@/shared/components/EmptyState";
import { PAGE_SIZE_OPTIONS } from "@/state/createPagedStore";
import { BulkActionBar } from "./BulkActionBar";
import { TableViewButton } from "./TableViewButton";
import { TableToolbar, type TableAdd, type TableSearch } from "./TableToolbar";
import { actionsColumn } from "./actionsColumn";
import { AUTO_ROW_HEIGHT, gridSx, LOCKED_GRID, rowClassName, type RowTone } from "./gridBase";
import { useGridColumns } from "./gridColumns";
import { useColumnsPanel } from "./useColumnsPanel";
import { useTableDensity } from "./tableViews";
import type { TableAction } from "./tableAction";
import { useTableExport, type TableExport } from "./useTableExport";

const NO_IDS: ReadonlySet<GridRowId> = new Set();

interface TableEmpty {
  title: string;
  hint?: string;
}

export interface DataTableProps<T extends GridValidRowModel & { id: string }> {
  label: string;
  viewKey: string;
  columns: GridColDef<T>[];
  rows: T[];
  total: number;
  loaded: boolean;
  loading: boolean;
  page: number;
  pageSize: number;
  onPageChange: (page: number, pageSize: number) => void;
  search?: TableSearch;
  filters?: ReactNode;
  summary?: ReactNode;
  add?: TableAdd;
  toolbarActions?: ReactNode;
  exportConfig?: TableExport<T>;
  rowLabel: (row: T) => string;
  rowActions?: (row: T) => TableAction[];
  rowBusy?: (row: T) => boolean;
  rowTone?: (row: T) => RowTone;
  bulkActions?: (selected: T[]) => TableAction[];
  empty: TableEmpty;
  filtered: boolean;
  onClearFilters?: () => void;
  autoRowHeight?: boolean;
  error?: string | null;
  onDismissError?: () => void;
  onReload: () => void;
}

// Server-paged, never client-sorted; a new page of rows drops the selection.
export function DataTable<T extends GridValidRowModel & { id: string }>({
  label,
  viewKey,
  columns,
  rows,
  total,
  loaded,
  loading,
  page,
  pageSize,
  onPageChange,
  search,
  filters,
  summary,
  add,
  toolbarActions,
  exportConfig,
  rowLabel,
  rowActions,
  rowBusy,
  rowTone,
  bulkActions,
  empty,
  filtered,
  onClearFilters,
  autoRowHeight = false,
  error,
  onDismissError,
  onReload,
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const [selection, setSelection] = useState<{ rows: T[]; ids: ReadonlySet<GridRowId> }>({
    rows,
    ids: NO_IDS,
  });
  const selectedIds = selection.rows === rows ? selection.ids : NO_IDS;
  const selectedRows = rows.filter((row) => selectedIds.has(row.id));
  const clearSelection = () => setSelection({ rows, ids: NO_IDS });
  const tableExport = useTableExport(exportConfig, rows, total);

  const selectionModel = useMemo<GridRowSelectionModel>(
    () => ({ type: "include", ids: new Set(selectedIds) }),
    [selectedIds],
  );

  const allColumns = useMemo<GridColDef<T>[]>(() => {
    if (!rowActions) return columns;
    return [
      ...columns,
      actionsColumn<T>({ headerName: t("web.table.actions"), rowLabel, rowActions, rowBusy }),
    ];
  }, [columns, rowActions, rowBusy, rowLabel, t]);
  const grid = useGridColumns(allColumns, viewKey);
  const columnsPanel = useColumnsPanel();
  const { density } = useTableDensity();

  const showEmpty = loaded && !loading && !error && rows.length === 0;
  const bulk = bulkActions && selectedRows.length > 0
    ? bulkActions(selectedRows)
    : null;

  return (
    <Stack spacing={2}>
      <ErrorBanner message={error ?? null} onDismiss={onDismissError} onRetry={onReload} />
      <ErrorBanner message={tableExport.error} onDismiss={tableExport.clearError} />
      {summary ? (
        <Paper variant="outlined" sx={{ px: 2, py: 1.5 }}>
          {summary}
        </Paper>
      ) : null}
      {bulk ? (
        <BulkActionBar count={selectedRows.length} actions={bulk} onClear={clearSelection} />
      ) : (
        <TableToolbar
          search={search}
          filters={filters}
          add={add}
          loading={loading}
          onReload={onReload}
          tools={
            <>
              {showEmpty ? null : columnsPanel.button}
              <TableViewButton onResetColumns={grid.resetColumns} />
              {tableExport.button}
              {toolbarActions}
            </>
          }
        />
      )}
      {showEmpty ? (
        <Paper variant="outlined">
          {filtered ? (
            <EmptyState
              title={t("common.no_results")}
              hint={t("web.table.no_results_hint")}
              actionLabel={onClearFilters ? t("common.clear_filters") : undefined}
              onAction={onClearFilters}
            />
          ) : (
            <EmptyState
              title={empty.title}
              hint={empty.hint}
              actionLabel={add?.label}
              onAction={add?.onClick}
            />
          )}
        </Paper>
      ) : (
        <DataGrid<T>
          aria-label={label}
          apiRef={columnsPanel.apiRef}
          rows={rows}
          {...grid.gridProps}
          density={density}
          onPreferencePanelOpen={columnsPanel.onPreferencePanelOpen}
          onPreferencePanelClose={columnsPanel.onPreferencePanelClose}
          rowCount={total}
          loading={loading}
          paginationMode="server"
          paginationModel={{ page, pageSize }}
          onPaginationModelChange={(model) => onPageChange(model.page, model.pageSize)}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          checkboxSelection={Boolean(bulkActions)}
          disableRowSelectionOnClick
          disableRowSelectionExcludeModel
          rowSelectionModel={selectionModel}
          onRowSelectionModelChange={(model) => setSelection({ rows, ids: model.ids })}
          hideFooterSelectedRowCount
          {...LOCKED_GRID}
          getRowHeight={autoRowHeight ? AUTO_ROW_HEIGHT : undefined}
          getRowClassName={(params) => rowClassName(params.indexRelativeToCurrentPage, rowTone?.(params.row))}
          slotProps={{
            loadingOverlay: { variant: "linear-progress", noRowsVariant: "linear-progress" },
            panel: { target: columnsPanel.panelTarget },
          }}
          sx={gridSx(autoRowHeight, density)}
        />
      )}
    </Stack>
  );
}
