import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import OpenInNewOutlined from "@mui/icons-material/OpenInNewOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import RemoveCircleOutlineOutlined from "@mui/icons-material/RemoveCircleOutlineOutlined";
import type { GridColDef } from "@mui/x-data-grid";
import type { CustomerDebts } from "@shared/core/types";
import { findCurrency, formatMoney } from "@shared/core/utils/currency";
import { debtorOwedItems, filterDebtors } from "@shared/modules/transaction/debts/utils/debtorView";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@shared/state/hooks/useTenantSettingSlice";
import { EmptyState } from "@/shared/components/EmptyState";
import { MoneyText } from "@/shared/components/MoneyText";
import { SearchField } from "@/shared/components/SearchField";
import { LocalTable } from "@/shared/table/LocalTable";
import { RowLink } from "@/shared/table/RowLink";
import type { TableAction } from "@/shared/table/tableAction";
import { DebtorDialog } from "./DebtorDialog";
import type { DebtDoors } from "./useDebtDoors";

type DebtorRow = CustomerDebts & { id: string };

interface DebtorsTabProps {
  debtors: CustomerDebts[];
  loaded: boolean;
  doors: DebtDoors;
}

const rowLabel = (row: DebtorRow) => row.customerName;

// Most behind first, as the view sorts it; the dialog follows the view's re-reads.
export function DebtorsTab({ debtors, loaded, doors }: DebtorsTabProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const currencies = useCurrencySlice((s) => s.items);
  const display = findCurrency(currencies, useDisplayCurrencyId());
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const openDebtor = debtors.find((d) => d.customerId === openId) ?? null;

  const rows = useMemo<DebtorRow[]>(
    () => filterDebtors(debtors, search).map((d) => ({ ...d, id: d.customerId })),
    [debtors, search],
  );

  const columns: GridColDef<DebtorRow>[] = [
    {
      field: "customerName",
      headerName: t("debts.customer_label"),
      flex: 1.2,
      minWidth: 180,
      renderCell: (params) => (
        <RowLink
          label={params.row.customerName}
          tabIndex={params.tabIndex}
          onClick={() => setOpenId(params.row.customerId)}
        />
      ),
    },
    {
      field: "oldestDaysLate",
      headerName: t("web.debts.how_late"),
      flex: 1,
      minWidth: 200,
      renderCell: (params) => <LateText debtor={params.row} />,
    },
    {
      field: "bills",
      headerName: t("web.debts.bills_column"),
      width: 110,
      align: "right",
      headerAlign: "right",
      valueGetter: (_value, row) => row.items.length,
    },
    {
      field: "debtUsd",
      headerName: t("web.debts.debt_column"),
      width: 160,
      align: "right",
      headerAlign: "right",
      renderCell: (params) => <MoneyText primary={formatMoney(params.row.debtUsd, null, display)} />,
    },
  ];

  const rowActions = (row: DebtorRow): TableAction[] => [
    {
      key: "view",
      group: "open",
      label: t("web.debts.view_debts"),
      icon: ReceiptLongOutlined,
      onClick: () => setOpenId(row.customerId),
    },
    {
      key: "customer-page",
      group: "open",
      label: t("web.debts.open_customer"),
      icon: OpenInNewOutlined,
      onClick: () => void navigate(`/customers/${row.customerId}`),
    },
    {
      key: "collect",
      group: "money",
      label: t("payments.collect"),
      icon: PaymentsOutlined,
      onClick: () => doors.collectAll(row.customerId, row.customerName, debtorOwedItems(row)),
    },
    {
      key: "write-off-all",
      group: "danger",
      label: t("ledger.write_off_all"),
      caption: t("ledger.write_off_all_caption"),
      icon: RemoveCircleOutlineOutlined,
      destructive: true,
      onClick: () => doors.writeOffAll(row.customerName, debtorOwedItems(row)),
    },
  ];

  return (
    <Stack spacing={2}>
      <SearchField value={search} onSearch={setSearch} placeholder={t("debts.search_debtors_hint")} />
      {!loaded ? (
        <Box sx={{ py: 4, display: "flex", justifyContent: "center" }}>
          <CircularProgress aria-label={t("web.loading")} />
        </Box>
      ) : rows.length === 0 ? (
        <Paper variant="outlined">
          <EmptyState
            title={t("debts.no_debtors")}
            hint={search.trim() ? t("debts.no_debtors_search") : t("debts.no_debtors_hint")}
          />
        </Paper>
      ) : (
        <LocalTable<DebtorRow>
          label={t("web.debts.debtors_tab")}
          columns={columns}
          rows={rows}
          rowLabel={rowLabel}
          rowActions={rowActions}
          autoRowHeight
        />
      )}
      {openDebtor ? <DebtorDialog debtor={openDebtor} doors={doors} onClose={() => setOpenId(null)} /> : null}
    </Stack>
  );
}

// Unpaid months belong to the month grid, so they ride as a muted hint only.
function LateText({ debtor }: { debtor: CustomerDebts }) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const display = findCurrency(currencies, useDisplayCurrencyId());
  const unpaid = debtor.unpaidMonths.length;
  return (
    <Stack sx={{ justifyContent: "center", height: "100%", lineHeight: 1.3 }}>
      <Typography
        variant="body2"
        sx={{ color: debtor.oldestDaysLate > 0 ? "error.main" : "text.secondary", fontWeight: 600 }}
      >
        {debtor.oldestDaysLate > 0
          ? t("ledger.oldest_days_late", { count: debtor.oldestDaysLate })
          : t("ledger.not_late_yet")}
      </Typography>
      {unpaid > 0 ? (
        <Typography variant="caption" color="text.secondary">
          {t("ledger.plus_unpaid_months", {
            count: unpaid,
            amount: formatMoney(debtor.unpaidMonthsUsd, null, display),
          })}
        </Typography>
      ) : null}
    </Stack>
  );
}
