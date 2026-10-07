import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { GridColDef } from "@mui/x-data-grid";
import type { ExpenseItem } from "@shared/core/types";
import { formatMoney, snapshotCurrency } from "@shared/core/utils/currency";
import { formatDate } from "@shared/core/utils/date";
import { useExpensesList } from "@shared/modules/transaction/expenses/hooks/useExpensesList";
import {
  EXPENSE_FILTER_CATEGORIES,
  expenseCategoryLabelKey,
} from "@shared/modules/transaction/expenses/utils/expenseCategories";
import {
  EXPENSE_SOURCE_TONE,
  expenseMenuItems,
  type ExpenseCategoryFilter,
} from "@shared/modules/transaction/expenses/utils/expenseList";
import { outflowLabel, outflowPair } from "@shared/modules/transaction/expenses/utils/outflow";
import { useUserNames } from "@shared/shared/hooks/useUserNames";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useDisplayCurrency } from "@shared/state/hooks/useDisplayCurrency";
import { MoneyText } from "@/shared/components/MoneyText";
import { PeriodPicker } from "@/shared/components/PeriodPicker";
import { StatusChip } from "@/shared/components/StatusChip";
import { DataTable } from "@/shared/table/DataTable";
import { FilterSelect } from "@/shared/table/FilterSelect";
import { toTableActions, type TableAction } from "@/shared/table/tableAction";
import { useBranchColumn } from "@/shared/table/useBranchColumn";
import { useRowsPage } from "@/shared/table/useRowsPage";
import { EXPENSE_ACTION_ICONS, EXPENSE_CATEGORY_ICON } from "../utils/expenseLook";
import { ExpenseFormDialog } from "../components/ExpenseFormDialog";

const rowLabel = (row: ExpenseItem) => row.label;

// One date window held in memory, as on the phone; paged here, not by the server.
export function ExpensesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const list = useExpensesList(search);
  const paging = useRowsPage(list.rows);
  const currencies = useCurrencySlice((s) => s.items);
  const display = useDisplayCurrency();
  const userName = useUserNames();
  const branchColumn = useBranchColumn<ExpenseItem>(t("expenses.company_wide"));
  const { remove, setCategory, setPeriod, clearFilters } = list;
  const { toFirstPage } = paging;

  const onSearch = (term: string) => {
    setSearch(term);
    toFirstPage();
  };

  const clearAll = () => {
    setSearch("");
    toFirstPage();
    void clearFilters();
  };

  const rowActions = useCallback(
    (row: ExpenseItem): TableAction[] =>
      toTableActions(expenseMenuItems(row), t, {
        icons: EXPENSE_ACTION_ICONS,
        run: {
          product: () => void navigate("/admin/products"),
          remove: () => void remove(row),
        },
      }),
    [navigate, remove, t],
  );

  const columns = useMemo<GridColDef<ExpenseItem>[]>(
    () => [
      {
        field: "date",
        headerName: t("expenses.date_label"),
        width: 130,
        valueGetter: (_value, row) => formatDate(row.date),
      },
      {
        field: "label",
        headerName: t("expenses.description_label"),
        flex: 1.4,
        minWidth: 220,
      },
      {
        field: "category",
        headerName: t("expenses.category_label"),
        width: 170,
        renderCell: (params) => (
          <StatusChip
            tone={EXPENSE_SOURCE_TONE[params.row.source]}
            icon={EXPENSE_CATEGORY_ICON[params.row.category]}
            label={t(expenseCategoryLabelKey(params.row.category))}
          />
        ),
      },
      {
        field: "recordedByUserId",
        headerName: t("web.expenses.recorded_by"),
        width: 160,
        valueGetter: (_value, row) => userName(row.recordedByUserId) ?? t("common.unknown"),
      },
      ...(branchColumn ? [branchColumn] : []),
      {
        field: "amount",
        headerName: t("expenses.amount_label"),
        width: 170,
        renderCell: (params) => {
          const money = outflowPair(params.row.amount, snapshotCurrency(params.row, currencies), display);
          return <MoneyText primary={money.primary} approx={money.approx} />;
        },
      },
    ],
    [branchColumn, currencies, display, t, userName],
  );

  return (
    <>
      <DataTable<ExpenseItem>
        viewKey="expenses"
        label={t("expenses.title")}
        columns={columns}
        rows={paging.rows}
        total={paging.total}
        page={paging.page}
        pageSize={paging.pageSize}
        onPageChange={paging.onPageChange}
        loaded={list.loaded}
        loading={list.loading}
        search={{ value: search, onSearch, placeholder: t("expenses.search_placeholder") }}
        filters={
          <>
            <PeriodPicker
              value={list.period}
              onChange={(period) => {
                toFirstPage();
                void setPeriod(period);
              }}
            />
            <FilterSelect<ExpenseCategoryFilter>
              label={t("expenses.filter_by_category")}
              value={list.category}
              onChange={(category) => {
                toFirstPage();
                setCategory(category);
              }}
              options={[
                { value: "all", label: t("expenses.all_categories") },
                ...EXPENSE_FILTER_CATEGORIES.map((category) => ({
                  value: category.code,
                  label: t(category.labelKey),
                })),
              ]}
            />
            {list.filtersChanged || search ? (
              <Button onClick={clearAll}>{t("common.clear_filters")}</Button>
            ) : null}
          </>
        }
        summary={
          <Stack direction="row" spacing={2} sx={{ alignItems: "baseline", justifyContent: "space-between" }}>
            <Box>
              <Typography variant="body2" color="text.secondary">
                {list.filtered
                  ? t("web.expenses.shown_total", { count: list.rows.length })
                  : t("expenses.total_spent")}
              </Typography>
              {list.breakdown ? (
                <Typography variant="caption" color="text.secondary">
                  {t("expenses.breakdown", {
                    stock: formatMoney(list.breakdown.stockUsd, null, display),
                    other: formatMoney(list.breakdown.manualUsd, null, display),
                  })}
                </Typography>
              ) : null}
            </Box>
            <Typography sx={{ fontWeight: 700 }}>{outflowLabel(list.totalUsd, null, display)}</Typography>
          </Stack>
        }
        add={{ label: t("expenses.add_title"), onClick: () => setAdding(true) }}
        rowLabel={rowLabel}
        rowActions={rowActions}
        empty={{ title: t("expenses.no_expenses"), hint: t("expenses.no_expenses_hint") }}
        filtered={list.filtered}
        onClearFilters={clearAll}
        error={list.error}
        onDismissError={list.clearError}
        onReload={() => void list.reload()}
      />
      {adding ? <ExpenseFormDialog onClose={() => setAdding(false)} /> : null}
    </>
  );
}
