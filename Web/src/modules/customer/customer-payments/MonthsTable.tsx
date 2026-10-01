import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { GridColDef } from "@mui/x-data-grid";
import type { Currency, MonthEntry } from "@shared/core/types";
import { findCurrency, formatMoney, snapshotCurrency } from "@shared/core/utils/currency";
import type { CustomerMonthGrid } from "@shared/modules/customer/customer-payments/hooks/useCustomerMonthGrid";
import { getBlockRangeLabel } from "@shared/modules/customer/customer-payments/utils/blockRangeLabel";
import { isCurrentMonth } from "@shared/modules/customer/customer-payments/utils/monthGridLayout";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { MoneyText } from "@/shared/components/MoneyText";
import { StatusChip } from "@/shared/components/StatusChip";
import { LocalTable } from "@/shared/table/LocalTable";
import { RowLink } from "@/shared/table/RowLink";
import type { TableAction } from "@/shared/table/tableAction";
import { monthStatusLook } from "./monthStatusLook";

type MonthRow = MonthEntry & { id: string };

interface MonthsTableProps {
  grid: CustomerMonthGrid;
  menuActions: (entry: MonthEntry) => TableAction[];
}

// Money reached the month: the bill's own figures, never the line's price.
function hasMoney(entry: MonthEntry): boolean {
  return entry.collected > 0 || !!entry.charge?.writtenOffAt;
}

// One row per month of the viewed year; a bundle's money sits on its first month.
export function MonthsTable({ grid, menuActions }: MonthsTableProps) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const { linePrice, selection } = grid;
  const lineCurrency = findCurrency(currencies, linePrice.currencyId);
  const rows: MonthRow[] = grid.grid.map((entry) => ({ ...entry, id: entry.billingMonth }));

  const monthName = (entry: MonthEntry) => `${t(`months.${entry.label}`)} ${entry.year}`;

  const money = (amount: number, currency: Currency | null) => formatMoney(amount, currency, currency);

  const billCell = (entry: MonthEntry) => {
    if (entry.isGroupSecondary) return null;
    if (entry.charge && hasMoney(entry)) {
      return <MoneyText primary={money(entry.charge.amount, snapshotCurrency(entry.charge, currencies))} />;
    }
    const due = entry.status === "unpaid" || entry.status === "future";
    if (!due || !linePrice.isFixed || linePrice.durationMonths > 1) return null;
    return (
      <Typography variant="body2" color="text.secondary">
        {money(linePrice.amount!, lineCurrency)}
      </Typography>
    );
  };

  const noteOf = (entry: MonthEntry): string => {
    const charge = entry.charge;
    if (charge && entry.collected > 0 && charge.durationMonths > 1) {
      const range = getBlockRangeLabel(charge.billingMonth ?? entry.billingMonth, charge.durationMonths, t);
      return entry.isGroupSecondary
        ? t("web.month_grid.in_bill", { range })
        : t("web.month_grid.covers", { range });
    }
    return entry.skip?.note ?? "";
  };

  const columns: GridColDef<MonthRow>[] = [
    {
      field: "month",
      headerName: t("web.month_grid.col_month"),
      width: 160,
      renderCell: (params) => (
        <Box>
          {params.row.status === "before_start" ? (
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
      align: "right",
      headerAlign: "right",
      renderCell: (params) => billCell(params.row),
    },
    {
      field: "paid",
      headerName: t("web.month_grid.col_paid"),
      width: 140,
      align: "right",
      headerAlign: "right",
      renderCell: (params) =>
        !params.row.isGroupSecondary && params.row.charge && params.row.collected > 0 ? (
          <Typography variant="body2" sx={{ color: "success.dark", fontWeight: 600 }}>
            {money(params.row.collected, snapshotCurrency(params.row.charge, currencies))}
          </Typography>
        ) : null,
    },
    {
      field: "owed",
      headerName: t("web.month_grid.col_owed"),
      width: 140,
      align: "right",
      headerAlign: "right",
      renderCell: (params) => {
        const { charge, balance, isGroupSecondary } = params.row;
        if (isGroupSecondary || !charge || charge.writtenOffAt || params.row.collected <= 0 || balance <= 0) {
          return null;
        }
        return (
          <Typography variant="body2" sx={{ color: "error.main", fontWeight: 600 }}>
            {money(balance, snapshotCurrency(charge, currencies))}
          </Typography>
        );
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
      rowTone={(row) => (row.status === "before_start" ? "muted" : isCurrentMonth(row) ? "highlighted" : null)}
      autoRowHeight
      selection={{
        ids: selection.selectedIds,
        onChange: selection.replace,
        isSelectable: (row) => row.status !== "before_start",
      }}
    />
  );
}
