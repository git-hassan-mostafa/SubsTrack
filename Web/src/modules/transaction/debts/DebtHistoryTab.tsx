import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import type { GridColDef } from "@mui/x-data-grid";
import type { BranchFilter } from "@shared/core/constants";
import type { ChargeKind, DebtHistoryItem } from "@shared/core/types";
import {
  findCurrency,
  formatMoney,
  formatMoneyPair,
  snapshotCurrency,
} from "@shared/core/utils/currency";
import { formatDate } from "@shared/core/utils/date";
import { DEBT_KINDS } from "@shared/modules/transaction/debts/utils/allDebtsFilter";
import {
  HISTORY_OUTCOMES,
  HISTORY_PERIOD_PRESETS,
  HISTORY_SORTS,
  daysLateSettling,
  daysOverdue,
  hasActiveHistoryFilters,
  historyOutcomeOf,
  type HistoryOutcome,
  type HistoryPeriodPreset,
  type HistorySort,
} from "@shared/modules/transaction/debts/utils/debtHistory";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@shared/state/hooks/useTenantSettingSlice";
import type { ChipTone } from "@/shared/components/chipTones";
import { MoneyText } from "@/shared/components/MoneyText";
import { StatusChip } from "@/shared/components/StatusChip";
import { DataTable } from "@/shared/table/DataTable";
import { usePagedTable } from "@/shared/table/usePagedTable";
import { FilterSelect } from "@/shared/table/FilterSelect";
import { RowLink } from "@/shared/table/RowLink";
import { CustomerPicker } from "@/modules/customer/customers/CustomerPicker";
import { KIND_ICON, KIND_TONE } from "@/modules/ledger/kindLook";
import { useDebtHistoryTable, type DebtHistoryRow } from "@/state/debtHistoryTable";
import type { DebtDoors } from "./useDebtDoors";

const OUTCOME_TONE: Record<HistoryOutcome, ChipTone> = {
  settled: "emerald",
  partial: "amber",
  open: "red",
  written_off: "orange",
};

const rowLabel = (row: DebtHistoryRow) => row.label;
const rowTone = (row: DebtHistoryRow) => (historyOutcomeOf(row) === "written_off" ? "muted" : null);

interface DebtHistoryTabProps {
  branch: BranchFilter;
  doors: Pick<DebtDoors, "openBill">;
}

// Past bills that left a customer owing; a customer is PICKED, never typed.
export function DebtHistoryTab({ branch, doors }: DebtHistoryTabProps) {
  const { t } = useTranslation();
  const table = useDebtHistoryTable;
  const paged = usePagedTable(table, branch);
  const query = paged.query;
  const setFilters = paged.setFilters;
  const currencies = useCurrencySlice((s) => s.items);
  const display = findCurrency(currencies, useDisplayCurrencyId());
  const { openBill } = doors;
  const filters = query.filters;

  const columns = useMemo<GridColDef<DebtHistoryRow>[]>(() => {
    const own = (amount: number, row: DebtHistoryItem) => {
      const source = snapshotCurrency(row, currencies);
      return formatMoney(amount, source, source);
    };
    return [
      {
        field: "customerName",
        headerName: t("debts.customer_label"),
        flex: 1,
        minWidth: 150,
        renderCell: (params) => (
          <RowLink
            label={params.row.customerName}
            tabIndex={params.tabIndex}
            href={`/customers/${params.row.customerId}`}
          />
        ),
      },
      {
        field: "label",
        headerName: t("web.customer_detail.bill_column"),
        flex: 1.2,
        minWidth: 170,
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
        width: 150,
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
        width: 120,
        valueGetter: (_value, row) => formatDate(row.dueDate),
      },
      {
        field: "amount",
        headerName: t("web.debts.billed_column"),
        width: 150,
        align: "right",
        headerAlign: "right",
        renderCell: (params) => {
          const money = formatMoneyPair(params.row.amount, snapshotCurrency(params.row, currencies), display);
          return <MoneyText primary={money.primary} approx={money.approx} />;
        },
      },
      {
        field: "downPaid",
        headerName: t("web.debts.paid_on_the_day"),
        width: 140,
        align: "right",
        headerAlign: "right",
        renderCell: (params) => <MoneyText primary={own(params.row.downPaid, params.row)} />,
      },
      {
        field: "balance",
        headerName: t("web.customer_detail.still_owed"),
        width: 140,
        align: "right",
        headerAlign: "right",
        renderCell: (params) =>
          params.row.balance > 0 ? <MoneyText primary={own(params.row.balance, params.row)} /> : null,
      },
      {
        field: "outcome",
        headerName: t("web.debts.what_happened"),
        flex: 1.4,
        minWidth: 220,
        renderCell: (params) => <OutcomeChips item={params.row} />,
      },
      {
        field: "settledAt",
        headerName: t("web.debts.settled_on"),
        width: 130,
        valueGetter: (_value, row) => (row.settledAt ? formatDate(row.settledAt) : ""),
      },
    ];
  }, [currencies, display, openBill, t]);

  return (
    <DataTable<DebtHistoryRow>
      label={t("debts.history_title")}
      columns={columns}
      {...paged.tableProps}
      filters={
        <>
          <FilterSelect<HistoryPeriodPreset>
            label={t("debts.filter_by_period")}
            value={filters.period}
            onChange={(period) => setFilters({ period })}
            options={HISTORY_PERIOD_PRESETS.map((preset) => ({
              value: preset,
              label: preset === "all" ? t("debts.period_all") : t(`reports.period_${preset}`),
            }))}
          />
          <CustomerPicker
            label={t("debts.filter_by_customer")}
            value={filters.customer}
            onChange={(customer) => setFilters({ customer, customerId: customer?.id ?? null })}
            placeholder={t("debts.all_customers")}
            size="small"
            minWidth={220}
          />
          <FilterSelect<HistoryOutcome | null>
            label={t("debts.filter_by_outcome")}
            anyLabel={t("debts.all_outcomes")}
            value={filters.outcome}
            onChange={(outcome) => setFilters({ outcome })}
            options={HISTORY_OUTCOMES.map((outcome) => ({ value: outcome, label: t(`debts.outcome_${outcome}`) }))}
          />
          <FilterSelect<ChargeKind | null>
            label={t("ledger.filter_by_type")}
            anyLabel={t("ledger.all_types")}
            value={filters.kind}
            onChange={(kind) => setFilters({ kind })}
            options={DEBT_KINDS.map((kind) => ({ value: kind, label: t(`ledger.kind_${kind}`) }))}
          />
          <FilterSelect<HistorySort>
            label={t("ledger.sort_by_label")}
            value={filters.sort}
            onChange={(sort) => setFilters({ sort })}
            options={HISTORY_SORTS.map((sort) => ({ value: sort, label: t(`debts.sort_${sort}`) }))}
          />
        </>
      }
      rowLabel={rowLabel}
      rowTone={rowTone}
      autoRowHeight
      empty={{ title: t("debts.history_empty"), hint: t("debts.history_empty_hint") }}
      filtered={hasActiveHistoryFilters(filters)}
    />
  );
}

// What became of the bill, then how late the money was or still is.
function OutcomeChips({ item }: { item: DebtHistoryItem }) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const source = snapshotCurrency(item, currencies);
  const outcome = historyOutcomeOf(item);
  const laterPaid = item.paid - item.downPaid;
  const lateSettling = daysLateSettling(item);
  const overdue = daysOverdue(item);
  return (
    <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
      <StatusChip label={t(`debts.outcome_${outcome}`)} tone={OUTCOME_TONE[outcome]} />
      {laterPaid > 0 ? (
        <StatusChip
          label={t("debts.history_paid_later", { amount: formatMoney(laterPaid, source, source) })}
          tone="emerald"
        />
      ) : null}
      {lateSettling ? (
        <StatusChip label={t("debts.history_settled_late", { count: lateSettling })} tone="amber" />
      ) : null}
      {overdue ? <StatusChip label={t("ledger.days_late", { count: overdue })} tone="red" /> : null}
    </Stack>
  );
}
