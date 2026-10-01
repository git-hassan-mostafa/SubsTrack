import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import AddIcon from "@mui/icons-material/Add";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
  DataGrid,
  type GridColDef,
  type GridRowId,
  type GridRowSelectionModel,
  type GridValidRowModel,
} from "@mui/x-data-grid";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { EmptyState } from "@/shared/components/EmptyState";
import { SearchField } from "@/shared/components/SearchField";
import { PAGE_SIZE_OPTIONS } from "@/state/createPagedStore";
import { BulkActionBar } from "./BulkActionBar";
import { FilterBar } from "./FilterBar";
import { actionsColumn } from "./actionsColumn";
import { AUTO_ROW_HEIGHT, gridSx, LOCKED_GRID, rowClassName, type RowTone } from "./gridBase";
import type { TableAction } from "./tableAction";
import { useTableExport, type TableExport } from "./useTableExport";

const NO_IDS: ReadonlySet<GridRowId> = new Set();

interface TableEmpty {
  title: string;
  hint?: string;
}

export interface DataTableProps<T extends GridValidRowModel & { id: string }> {
  label: string;
  columns: GridColDef<T>[];
  rows: T[];
  total: number;
  loaded: boolean;
  loading: boolean;
  page: number;
  pageSize: number;
  onPageChange: (page: number, pageSize: number) => void;
  search?: { value: string; onSearch: (term: string) => void; placeholder?: string };
  filters?: ReactNode;
  summary?: ReactNode;
  add?: { label: string; onClick: () => void };
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

  const showEmpty = loaded && !loading && !error && rows.length === 0;
  const bulk = bulkActions && selectedRows.length > 0
    ? bulkActions(selectedRows)
    : null;

  return (
    <Stack spacing={2}>
      <ErrorBanner message={error ?? null} onDismiss={onDismissError} onRetry={onReload} />
      <ErrorBanner message={tableExport.error} onDismiss={tableExport.clearError} />
      {bulk ? (
        <BulkActionBar count={selectedRows.length} actions={bulk} onClear={clearSelection} />
      ) : (
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          sx={{ alignItems: { sm: "center" }, minHeight: 56, minWidth: 0 }}
        >
          {search ? (
            <SearchField
              value={search.value}
              onSearch={search.onSearch}
              placeholder={search.placeholder}
            />
          ) : null}
          {filters ? <FilterBar>{filters}</FilterBar> : <Box sx={{ flexGrow: 1 }} />}
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Tooltip title={t("web.table.refresh")}>
              <span>
                <IconButton
                  aria-label={t("web.table.refresh")}
                  disabled={loading}
                  onClick={onReload}
                >
                  <RefreshIcon />
                </IconButton>
              </span>
            </Tooltip>
            {tableExport.button}
            {toolbarActions}
            {add ? (
              <Button variant="contained" startIcon={<AddIcon />} onClick={add.onClick}>
                {add.label}
              </Button>
            ) : null}
          </Stack>
        </Stack>
      )}
      {summary ? (
        <Paper variant="outlined" sx={{ px: 2, py: 1.5 }}>
          {summary}
        </Paper>
      ) : null}
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
          rows={rows}
          columns={allColumns}
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
          }}
          sx={gridSx(autoRowHeight)}
        />
      )}
    </Stack>
  );
}
