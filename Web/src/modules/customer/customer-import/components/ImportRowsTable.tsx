import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import type { GridColDef } from "@mui/x-data-grid";
import { isolate } from "@shared/core/utils/bidi";
import { rowReason, rowResult } from "@shared/modules/customer/customer-import/utils/importResult";
import {
  importRowStatus,
  importStatusTone,
  type ImportRowStatus,
} from "@shared/modules/customer/customer-import/utils/importView";
import type { ImportRow, ImportRunResult } from "@shared/modules/customer/customer-import/utils/types";
import { StatusChip } from "@/shared/components/StatusChip";
import { LocalTable } from "@/shared/table/LocalTable";

interface ImportRowsTableProps {
  rows: ImportRow[];
  result: ImportRunResult | null;
}

function notesOf(row: ImportRow, result: ImportRunResult | null): string {
  if (!result) return [...row.problems, ...row.warnings].join(" · ");
  if (rowResult(row, result).outcome === "imported") return row.warnings.join(" · ");
  return rowReason(row, result);
}

// One grid before and after the run: ready or not, then imported or not.
export function ImportRowsTable({ rows, result }: ImportRowsTableProps) {
  const { t } = useTranslation();
  const statusLabel = (status: ImportRowStatus) =>
    result ? t(`customer_import.outcome.${status}`) : t(`web.customer_import.status_${status}`);

  const columns: GridColDef<ImportRow>[] = [
    { field: "rowNumber", headerName: t("web.customer_import.column_row"), width: 80 },
    {
      field: "name",
      headerName: t("customer_import.field.name"),
      flex: 1,
      minWidth: 160,
      valueGetter: (_value, row) => row.cells.name,
    },
    {
      field: "phone",
      headerName: t("customer_import.field.phone"),
      width: 140,
      valueGetter: (_value, row) => row.cells.phone,
      renderCell: (params) => isolate(params.value ?? ""),
    },
    {
      field: "branch",
      headerName: t("customer_import.field.branch"),
      width: 130,
      valueGetter: (_value, row) => row.cells.branch,
    },
    {
      field: "plan",
      headerName: t("customer_import.field.plan"),
      width: 150,
      valueGetter: (_value, row) => row.cells.plan,
    },
    {
      field: "startDate",
      headerName: t("customer_import.field.start_date"),
      width: 120,
      valueGetter: (_value, row) => row.cells.start_date,
      renderCell: (params) => isolate(params.value ?? ""),
    },
    {
      field: "specialPrice",
      headerName: t("customer_import.field.special_price"),
      width: 130,
      valueGetter: (_value, row) => [row.cells.special_price, row.cells.currency].filter(Boolean).join(" "),
      renderCell: (params) => isolate(params.value ?? ""),
    },
    {
      field: "status",
      headerName: t("web.customer_import.column_status"),
      width: 140,
      valueGetter: (_value, row) => importRowStatus(row, result),
      renderCell: (params) => (
        <StatusChip label={statusLabel(params.value)} tone={importStatusTone(params.value)} />
      ),
    },
    {
      field: "notes",
      headerName: t("web.customer_import.column_notes"),
      flex: 2,
      minWidth: 280,
      valueGetter: (_value, row) => notesOf(row, result),
      renderCell: (params) => (
        <Box component="span" sx={{ whiteSpace: "normal", py: 1 }}>
          {params.value}
        </Box>
      ),
    },
  ];

  return (
    <LocalTable<ImportRow>
      viewKey={result ? "customer-import-result" : "customer-import-preview"}
      label={t("web.customer_import.title")}
      columns={columns}
      rows={rows}
      autoRowHeight
    />
  );
}
