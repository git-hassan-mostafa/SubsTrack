import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { GridColDef } from "@mui/x-data-grid";
import type { Currency, MonthEntry } from "@shared/core/types";
import { findCurrency, formatMoney, snapshotCurrency } from "@shared/core/utils/currency";
import type { CustomerMonthGrid } from "@shared/modules/customer/customer-payments/hooks/useCustomerMonthGrid";
import { getBlockRangeLabel } from "@shared/modules/customer/customer-payments/utils/blockRangeLabel";
import { isCurrentMonth } from "@shared/modules/customer/customer-payments/utils/monthGridLayout";
import {
  isSelectableMonth,
  monthBillFigure,
  monthNoteOf,
  monthOwedFigure,
  monthPaidFigure,
  monthRowEmphasis,
} from "@shared/modules/customer/customer-payments/utils/monthView";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { MoneyText } from "@/shared/components/MoneyText";
import { StatusChip } from "@/shared/components/StatusChip";
import { LocalTable } from "@/shared/table/LocalTable";
import { RowLink } from "@/shared/table/RowLink";
import type { TableAction } from "@/shared/table/tableAction";
import { monthStatusLook } from "../utils/monthStatusLook";

type MonthRow = MonthEntry & { id: string };

interface MonthsTableProps {
  grid: CustomerMonthGrid;
  menuActions: (entry: MonthEntry) => TableAction[];
}

// One row per month of the viewed year; a bundle's money sits on its first month.
export function MonthsTable({ grid, menuActions }: MonthsTableProps) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const { priceAt, selection } = grid;
  const rows: MonthRow[] = grid.grid.map((entry) => ({ ...entry, id: entry.billingMonth }));

  const monthName = (entry: MonthEntry) => `${t(`months.${entry.label}`)} ${entry.year}`;

  const money = (amount: number, currency: Currency | null) => formatMoney(amount, currency, currency);

  const billCell = (entry: MonthEntry) => {
    const figure = monthBillFigure(entry, priceAt(entry.billingMonth));
    if (!figure) return null;
    if (figure.from === "bill") {
      return <MoneyText primary={money(figure.charge.amount, snapshotCurrency(figure.charge, currencies))} />;
    }
    return (
      <Typography variant="body2" color="text.secondary">
        {money(figure.amount, findCurrency(currencies, figure.currencyId))}
      </Typography>
    );
  };

  const noteOf = (entry: MonthEntry): string => {
    const note = monthNoteOf(entry);
    if (!note) return "";
    if (note.kind === "skip") return note.note;
    const range = getBlockRangeLabel(note.startMonth, note.durationMonths, t);
    return t(`web.month_grid.${note.kind}`, { range });
  };

  const columns: GridColDef<MonthRow>[] = [
    {
      field: "month",
      headerName: t("web.month_grid.col_month"),
      width: 160,
      renderCell: (params) => (
        <Box>
          {!isSelectableMonth(params.row) ? (
            <Typography variant="body2">{monthName(params.row)}</Typography>
          ) : (
            <RowLink label={monthName(params.row)} tabIndex={params.tabIndex} onClick={() => grid.tap(params.row)} />
          )}
          {isCurrentMonth(params.row) ? (
            <Typography variant="caption" color="primary" sx={{ display: "block", fontWeight: 600 }}>
              {t("payments.this_month")}
            </Typography>
          ) : null}
        </Box>
      ),
    },
    {
      field: "status",
      headerName: t("web.month_grid.col_status"),
      width: 150,
      renderCell: (params) => {
        const look = monthStatusLook(params.row, grid.isRegular);
        return <StatusChip label={t(look.labelKey)} tone={look.tone} />;
      },
    },
    {
      field: "bill",
      headerName: t("web.month_grid.col_bill"),
      width: 140,
      renderCell: (params) => billCell(params.row),
    },
    {
      field: "paid",
      headerName: t("web.month_grid.col_paid"),
      width: 140,
      renderCell: (params) => {
        const paid = monthPaidFigure(params.row);
        return paid ? (
          <Typography variant="body2" sx={{ color: "success.dark", fontWeight: 600 }}>
            {money(paid.amount, snapshotCurrency(paid.charge, currencies))}
          </Typography>
        ) : null;
      },
    },
    {
      field: "owed",
      headerName: t("web.month_grid.col_owed"),
      width: 140,
      renderCell: (params) => {
        const owed = monthOwedFigure(params.row);
        return owed ? (
          <Typography variant="body2" sx={{ color: "error.main", fontWeight: 600 }}>
            {money(owed.amount, snapshotCurrency(owed.charge, currencies))}
          </Typography>
        ) : null;
      },
    },
    {
      field: "note",
      headerName: t("web.month_grid.col_note"),
      flex: 1,
      minWidth: 180,
      valueGetter: (_value, row) => noteOf(row),
    },
  ];

  return (
    <LocalTable<MonthRow>
      label={t("web.month_grid.table_label", { year: grid.year })}
      columns={columns}
      rows={rows}
      rowLabel={monthName}
      rowActions={menuActions}
      rowBusy={(row) => grid.busyMonth === row.billingMonth}
      rowTone={monthRowEmphasis}
      autoRowHeight
      selection={{
        ids: selection.selectedIds,
        onChange: selection.replace,
        isSelectable: isSelectableMonth,
      }}
    />
  );
}
