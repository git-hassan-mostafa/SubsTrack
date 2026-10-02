import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { GridColDef } from "@mui/x-data-grid";
import type { BranchFilter } from "@shared/core/constants";
import type { Sale } from "@shared/core/types";
import { findCurrency, formatMoney, formatMoneyPair, snapshotCurrency } from "@shared/core/utils/currency";
import { formatDateTime } from "@shared/core/utils/date";
import { receiptId, saleTitle } from "@shared/core/utils/receiptId";
import { hasSaleFilter } from "@shared/modules/transaction/sales/utils/saleFilters";
import { saleFacts } from "@shared/modules/transaction/sales/utils/saleView";
import { useUserNames } from "@shared/shared/hooks/useUserNames";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@shared/state/hooks/useTenantSettingSlice";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { MoneyText } from "@/shared/components/MoneyText";
import { DataTable } from "@/shared/table/DataTable";
import { RowLink } from "@/shared/table/RowLink";
import { useBranchColumn } from "@/shared/table/useBranchColumn";
import type { SalesTable as SalesTableStore } from "@/state/salesTable";
import { SalesFilters } from "./SalesFilters";
import { SaleStatusChips } from "./SaleStatusChips";
import { useSaleDoors } from "./useSaleDoors";

interface SalesTableProps {
  table: SalesTableStore;
  branch: BranchFilter;
  customerScoped?: boolean;
}

const rowTone = (sale: Sale) => (sale.voidedAt ? "muted" : null);

// The Sales page body; a customer's own sales page runs it on its own store.
export function SalesTable({ table, branch, customerScoped = false }: SalesTableProps) {
  const { t } = useTranslation();
  const rows = useStore(table, (s) => s.rows);
  const total = useStore(table, (s) => s.total);
  const totalUsd = useStore(table, (s) => s.meta);
  const loaded = useStore(table, (s) => s.loaded);
  const loading = useStore(table, (s) => s.loading);
  const error = useStore(table, (s) => s.error);
  const query = useStore(table, (s) => s.query);
  const load = useStore(table, (s) => s.load);
  const open = useStore(table, (s) => s.open);
  const setPage = useStore(table, (s) => s.setPage);
  const setSearch = useStore(table, (s) => s.setSearch);
  const setFilters = useStore(table, (s) => s.setFilters);
  const clearFilters = useStore(table, (s) => s.clearFilters);
  const clearError = useStore(table, (s) => s.clearError);
  const currencies = useCurrencySlice((s) => s.items);
  const display = findCurrency(currencies, useDisplayCurrencyId());
  const userName = useUserNames();
  const branchColumn = useBranchColumn<Sale>(t("web.money_received.no_branch"));
  const doors = useSaleDoors({ onChanged: () => void load() });
  const { openReceipt } = doors;

  useEffect(() => {
    void open(branch);
  }, [open, branch]);

  const rowLabel = useCallback((sale: Sale) => saleTitle(sale.id, sale.itemsSummary), []);

  const columns = useMemo<GridColDef<Sale>[]>(() => {
    const money = (amount: number, sale: Sale) => {
      const currency = snapshotCurrency(sale, currencies);
      return formatMoney(amount, currency, currency);
    };
    return [
      {
        field: "receipt",
        headerName: t("sales.receipt_id_label"),
        width: 130,
        renderCell: (params) => (
          <RowLink
            label={`#${receiptId(params.row.id)}`}
            tabIndex={params.tabIndex}
            onClick={() => openReceipt(params.row)}
          />
        ),
      },
      {
        field: "soldAt",
        headerName: t("sales.sold_at_label"),
        width: 160,
        valueGetter: (_value, row) => formatDateTime(row.soldAt),
      },
      ...(customerScoped
        ? []
        : [
            {
              field: "customer",
              headerName: t("sales.customer_label"),
              flex: 1,
              minWidth: 160,
              renderCell: (params) =>
                params.row.customer ? (
                  <RowLink
                    label={params.row.customer.name}
                    tabIndex={params.tabIndex}
                    href={`/customers/${params.row.customer.id}`}
                  />
                ) : (
                  t("sales.walk_in")
                ),
            } satisfies GridColDef<Sale>,
          ]),
      {
        field: "itemsSummary",
        headerName: t("sales.items_section_title"),
        flex: 1.4,
        minWidth: 200,
      },
      ...(branchColumn ? [branchColumn] : []),
      {
        field: "recordedByUserId",
        headerName: t("ledger.recorded_by"),
        width: 150,
        valueGetter: (_value, row) => userName(row.recordedByUserId) ?? "",
      },
      {
        field: "totalAmount",
        headerName: t("sales.total_label"),
        width: 160,
        align: "right",
        headerAlign: "right",
        renderCell: (params) => {
          const pair = formatMoneyPair(params.row.totalAmount, snapshotCurrency(params.row, currencies), display);
          const text = <MoneyText primary={pair.primary} approx={pair.approx} />;
          return params.row.voidedAt ? <Box sx={{ textDecoration: "line-through", height: "100%" }}>{text}</Box> : text;
        },
      },
      {
        field: "owed",
        headerName: t("web.customer_detail.still_owed"),
        width: 140,
        align: "right",
        headerAlign: "right",
        renderCell: (params) => {
          const facts = saleFacts(params.row);
          return facts.voided || facts.fullyPaid ? null : <MoneyText primary={money(facts.owed, params.row)} />;
        },
      },
      {
        field: "status",
        headerName: t("web.status"),
        flex: 1,
        minWidth: 150,
        renderCell: (params) => <SaleStatusChips sale={params.row} />,
      },
    ];
  }, [branchColumn, currencies, customerScoped, display, openReceipt, t, userName]);

  return (
    <Stack spacing={2}>
      <ErrorBanner message={doors.error} onDismiss={doors.clearError} />
      <ErrorBanner message={doors.notice} onDismiss={doors.clearNotice} severity="info" />
      <DataTable<Sale>
        label={t("sales.title")}
        columns={columns}
        rows={rows}
        total={total}
        loaded={loaded}
        loading={loading}
        page={query.page}
        pageSize={query.pageSize}
        onPageChange={setPage}
        search={{ value: query.search, onSearch: setSearch, placeholder: t("sales.search_placeholder") }}
        filters={<SalesFilters value={query.filters} onChange={setFilters} />}
        summary={
          totalUsd === null ? null : (
            <Stack direction="row" spacing={2} sx={{ alignItems: "baseline", justifyContent: "space-between" }}>
              <Typography variant="body2" color="text.secondary">
                {t("web.sales.total_sold")}
              </Typography>
              <Typography sx={{ fontWeight: 700, color: "success.main" }}>
                {formatMoney(totalUsd, null, display)}
              </Typography>
            </Stack>
          )
        }
        rowLabel={rowLabel}
        rowActions={doors.rowActions}
        rowTone={rowTone}
        bulkActions={doors.bulkActions}
        autoRowHeight
        empty={{
          title: t(customerScoped ? "sales.no_sales_for_customer" : "sales.no_sales"),
          hint: t("web.sales.empty_hint"),
        }}
        filtered={!!query.search || hasSaleFilter(query.filters)}
        onClearFilters={clearFilters}
        error={error}
        onDismissError={clearError}
        onReload={() => void load()}
      />
      {doors.dialogs}
    </Stack>
  );
}
