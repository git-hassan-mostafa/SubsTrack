import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { GridColDef } from "@mui/x-data-grid";
import type { OpenItem } from "@shared/core/types";
import { formatMoneyPair, formatPaidFraction, snapshotCurrency } from "@shared/core/utils/currency";
import { formatDate } from "@shared/core/utils/date";
import { debtItemFacts } from "@shared/modules/transaction/debts/utils/debtItemView";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useDisplayCurrency } from "@shared/state/hooks/useDisplayCurrency";
import { MoneyText } from "@/shared/components/MoneyText";
import { StatusChip } from "@/shared/components/StatusChip";
import { LocalTable } from "@/shared/table/LocalTable";
import { RowLink } from "@/shared/table/RowLink";
import { KIND_TONE } from "@shared/modules/ledger/utils/collectionKind";
import { KIND_ICON } from "@/modules/ledger/kindLook";
import type { DebtDoors } from "./useDebtDoors";

type DebtRow = OpenItem & { id: string };

interface DebtItemsTableProps {
  label: string;
  items: OpenItem[];
  doors: Pick<DebtDoors, "rowActions" | "openBill" | "loadingItemId">;
  emptyText: string;
  loading?: boolean;
  showCustomer?: boolean;
}

// A virtual month has no bill yet, so its line and month are its key.
function debtRowId(item: OpenItem): string {
  return item.chargeId ?? `${item.customerPlanId}:${item.billingMonth}`;
}

const rowLabel = (row: DebtRow) => row.label;
const rowTone = (row: DebtRow) => (row.charge?.writtenOffAt ? "muted" : null);

// Rows keep the caller's order; the money column is what is still owed.
export function DebtItemsTable({
  label,
  items,
  doors,
  emptyText,
  loading = false,
  showCustomer = false,
}: DebtItemsTableProps) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const display = useDisplayCurrency();
  const { rowActions, openBill, loadingItemId } = doors;
  const rows = useMemo<DebtRow[]>(() => items.map((item) => ({ ...item, id: debtRowId(item) })), [items]);

  const columns = useMemo<GridColDef<DebtRow>[]>(() => [
    ...(showCustomer
      ? [
          {
            field: "customerName",
            headerName: t("debts.customer_label"),
            flex: 1,
            minWidth: 160,
            renderCell: (params) => (
              <RowLink
                label={params.row.customerName}
                tabIndex={params.tabIndex}
                href={`/customers/${params.row.customerId}`}
              />
            ),
          } satisfies GridColDef<DebtRow>,
        ]
      : []),
    {
      field: "label",
      headerName: t("web.customer_detail.bill_column"),
      flex: 1.4,
      minWidth: 180,
      renderCell: (params) =>
        params.row.chargeId ? (
          <RowLink label={params.row.label} tabIndex={params.tabIndex} onClick={() => openBill(params.row)} />
        ) : (
          params.row.label
        ),
    },
    {
      field: "kind",
      headerName: t("web.customer_detail.type_column"),
      width: 160,
      renderCell: (params) => (
        <StatusChip
          label={t(`web.bill.kind_${params.row.kind}`)}
          tone={KIND_TONE[params.row.kind]}
          icon={KIND_ICON[params.row.kind]}
        />
      ),
    },
    {
      field: "dueDate",
      headerName: t("ledger.due_date"),
      width: 130,
      valueGetter: (_value, row) => formatDate(row.dueDate),
    },
    {
      field: "status",
      headerName: t("customers.status_label"),
      flex: 1,
      minWidth: 180,
      renderCell: (params) => <DebtChips item={params.row} />,
    },
    {
      field: "balance",
      headerName: t("web.customer_detail.still_owed"),
      width: 150,
      renderCell: (params) => {
        const money = formatMoneyPair(params.row.balance, snapshotCurrency(params.row, currencies), display);
        return <MoneyText primary={money.primary} approx={money.approx} />;
      },
    },
  ], [t, showCustomer, openBill, currencies, display]);
  const rowBusy = useCallback((row: DebtRow) => loadingItemId === row.id, [loadingItemId]);

  if (loading && rows.length === 0) {
    return (
      <Box sx={{ py: 4, display: "flex", justifyContent: "center" }}>
        <CircularProgress aria-label={t("web.loading")} />
      </Box>
    );
  }

  if (rows.length === 0) {
    return (
      <Paper variant="outlined" sx={{ py: 4, px: 2, textAlign: "center" }}>
        <Typography color="text.secondary">{emptyText}</Typography>
      </Paper>
    );
  }

  return (
    <LocalTable<DebtRow>
      label={label}
      columns={columns}
      rows={rows}
      rowLabel={rowLabel}
      rowActions={rowActions}
      rowBusy={rowBusy}
      rowTone={rowTone}
      autoRowHeight
    />
  );
}

// A chip means something is wrong with the bill, so a clean row shows none.
function DebtChips({ item }: { item: OpenItem }) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const facts = debtItemFacts(item);
  const source = snapshotCurrency(item, currencies);
  return (
    <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
      {facts.daysLate > 0 ? (
        <StatusChip label={t("ledger.days_late", { count: facts.daysLate })} tone="red" />
      ) : null}
      {facts.partlyPaid ? (
        <StatusChip label={formatPaidFraction(item.paid, item.amount, source, source)} tone="amber" />
      ) : null}
      {facts.writtenOff ? <StatusChip label={t("ledger.written_off")} tone="orange" /> : null}
    </Stack>
  );
}
