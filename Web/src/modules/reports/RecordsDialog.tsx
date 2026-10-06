import { useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { GridColDef } from "@mui/x-data-grid";
import { formatMoney, formatMoneyPair, snapshotCurrency } from "@shared/core/utils/currency";
import { formatDate } from "@shared/core/utils/date";
import { recordsCsv } from "@shared/modules/reports/utils/csvRows";
import { withTotal } from "@shared/modules/reports/utils/reportRecords";
import type { RecordRow } from "@shared/modules/reports/utils/types";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useDisplayCurrency } from "@shared/state/hooks/useDisplayCurrency";
import { CsvButton } from "@/shared/components/CsvButton";
import { MoneyText } from "@/shared/components/MoneyText";
import { LocalTable } from "@/shared/table/LocalTable";
import { RowLink } from "@/shared/table/RowLink";

export interface RecordsDrill {
  title: string;
  subtitle?: string;
  note?: string;
  rows: RecordRow[];
}

interface RecordsDialogProps {
  drill: RecordsDrill;
  exportName: string;
  onClose: () => void;
}

// Each row in its own currency at its frozen rate, so the rows add up to the number clicked.
export function RecordsDialog({ drill, exportName, onClose }: RecordsDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const currencies = useCurrencySlice((s) => s.items);
  const display = useDisplayCurrency();
  const { totalUsd } = withTotal(drill.rows);

  const columns = useMemo<GridColDef<RecordRow>[]>(
    () => [
      {
        field: "date",
        headerName: t("reports.col_date"),
        width: 120,
        valueGetter: (_value, row) => formatDate(row.date),
      },
      {
        field: "title",
        headerName: t("reports.col_name"),
        flex: 1,
        minWidth: 200,
        renderCell: (params) =>
          params.row.customerId ? (
            <RowLink
              label={params.row.title}
              tabIndex={params.tabIndex}
              href={`/customers/${params.row.customerId}`}
            />
          ) : (
            params.row.title
          ),
      },
      {
        field: "subtitle",
        headerName: t("reports.col_detail"),
        flex: 1,
        minWidth: 180,
        valueGetter: (_value, row) => row.subtitle ?? "",
      },
      {
        field: "amount",
        headerName: t("reports.col_amount"),
        width: 180,
        align: "right",
        headerAlign: "right",
        renderCell: (params) => {
          const pair = formatMoneyPair(
            params.row.amount,
            snapshotCurrency(params.row, currencies),
            display,
          );
          return <MoneyText primary={pair.primary} approx={pair.approx} />;
        },
      },
    ],
    [currencies, display, t],
  );

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth aria-labelledby={titleId}>
      <DialogTitle id={titleId} sx={{ fontWeight: 700 }}>
        {drill.title}
        {drill.subtitle ? (
          <Typography variant="body2" color="text.secondary" component="span" sx={{ display: "block" }}>
            {drill.subtitle}
          </Typography>
        ) : null}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "baseline" }}>
            <Typography variant="body2" color="text.secondary">
              {t("reports.total")}
            </Typography>
            <Typography variant="h6" component="p" sx={{ fontWeight: 700 }}>
              {formatMoney(totalUsd, null, display)}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
              {t("reports.record_count", { count: drill.rows.length })}
            </Typography>
            <CsvButton name={exportName} build={() => recordsCsv(drill.rows, currencies)} />
          </Stack>
          {drill.note ? (
            <Typography variant="body2" color="text.secondary">
              {drill.note}
            </Typography>
          ) : null}
          <LocalTable<RecordRow> label={drill.title} columns={columns} rows={drill.rows} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>{t("common.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}
