import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import OpenInNewOutlined from "@mui/icons-material/OpenInNewOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import type { GridColDef } from "@mui/x-data-grid";
import type { CustomerDebts } from "@shared/core/types";
import { formatMoney } from "@shared/core/utils/currency";
import { owingCustomerActions, filterOwingCustomers } from "@shared/modules/transaction/to-collect/utils/toCollectView";
import { customerOwedItems, customerOwedUsd } from "@shared/modules/ledger/utils/owedView";
import { useDisplayCurrency } from "@shared/state/hooks/useDisplayCurrency";
import { EmptyState } from "@/shared/components/EmptyState";
import { MoneyText } from "@/shared/components/MoneyText";
import { LocalTable } from "@/shared/table/LocalTable";
import { RowLink } from "@/shared/table/RowLink";
import { toTableActions, type TableAction } from "@/shared/table/tableAction";
import { TableToolbar, type TableAdd } from "@/shared/table/TableToolbar";
import { OWING_CUSTOMER_ACTION_ICONS } from "../utils/owedActionIcons";
import { OwingCustomerDialog } from "./OwingCustomerDialog";
import type { OwedDoors } from "../hooks/useOwedDoors";

type OwingCustomerRow = CustomerDebts & { id: string };

interface OwingCustomersTabProps {
  debtors: CustomerDebts[];
  loaded: boolean;
  doors: OwedDoors;
  add: TableAdd;
  loading: boolean;
  onReload: () => void;
  showFilter: ReactNode;
}

const rowLabel = (row: OwingCustomerRow) => row.customerName;

// Most behind first, as the view sorts it; the dialog follows the view's re-reads.
export function OwingCustomersTab({ debtors, loaded, doors, add, loading, onReload, showFilter }: OwingCustomersTabProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const display = useDisplayCurrency();
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const openDebtor = debtors.find((d) => d.customerId === openId) ?? null;

  const rows = useMemo<OwingCustomerRow[]>(
    () => filterOwingCustomers(debtors, search).map((d) => ({ ...d, id: d.customerId })),
    [debtors, search],
  );

  const { collectAll, writeOffAll } = doors;
  const columns = useMemo<GridColDef<OwingCustomerRow>[]>(() => [
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
      valueGetter: (_value, row) => row.items.length + row.unpaidMonths.length,
    },
    {
      field: "toCollectUsd",
      headerName: t("web.debts.debt_column"),
      width: 160,
      valueGetter: (_value, row) => customerOwedUsd(row),
      renderCell: (params) => <MoneyText primary={formatMoney(customerOwedUsd(params.row), null, display)} />,
    },
  ], [t, display]);

  const rowActions = useCallback((row: OwingCustomerRow): TableAction[] => [
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
    ...toTableActions(owingCustomerActions(customerOwedItems(row)), t, {
      icons: OWING_CUSTOMER_ACTION_ICONS,
      run: {
        collect_all: () => collectAll(row.customerId, row.customerName, customerOwedItems(row)),
        write_off_all: () => writeOffAll(row.customerName, customerOwedItems(row)),
      },
    }),
  ], [t, navigate, collectAll, writeOffAll]);

  return (
    <Stack spacing={2}>
      <TableToolbar
        search={{ value: search, onSearch: setSearch, placeholder: t("debts.search_debtors_hint") }}
        filters={showFilter}
        add={add}
        loading={loading}
        onReload={onReload}
      />
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
        <LocalTable<OwingCustomerRow>
          viewKey="owing-customers"
          label={t("debts.tab_debtors")}
          columns={columns}
          rows={rows}
          rowLabel={rowLabel}
          rowActions={rowActions}
          autoRowHeight
        />
      )}
      {openDebtor ? <OwingCustomerDialog debtor={openDebtor} doors={doors} onClose={() => setOpenId(null)} /> : null}
    </Stack>
  );
}

// The hint counts the plain unpaid months inside the amount.
function LateText({ debtor }: { debtor: CustomerDebts }) {
  const { t } = useTranslation();
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
          {t("ledger.unpaid_months_count", { count: unpaid })}
        </Typography>
      ) : null}
    </Stack>
  );
}
