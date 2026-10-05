import { useState } from "react";
import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { GridColDef } from "@mui/x-data-grid";
import type { Currency } from "@shared/core/types";
import { formatRate } from "@shared/core/utils/currency";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { MoneyText } from "@/shared/components/MoneyText";
import { ActiveFilterSelect } from "@/shared/table/ActiveFilterSelect";
import { activeStatusColumn } from "@/shared/table/activeStatusColumn";
import { DataTable } from "@/shared/table/DataTable";
import { useCatalogRowActions } from "@/shared/table/useCatalogRowActions";
import { usePagedTable } from "@/shared/table/usePagedTable";
import { RowLink } from "@/shared/table/RowLink";
import { readAllCurrencies, useCurrenciesTable } from "@/state/currenciesTable";
import { useHistoryDoor } from "@/modules/admin/audit/useHistoryDoor";
import { CurrencyFormDialog } from "./CurrencyFormDialog";

export function CurrenciesPage() {
  const { t } = useTranslation();
  const paged = usePagedTable(useCurrenciesTable);
  const query = paged.query;
  const patchRow = paged.patchRow;
  const setFilters = paged.setFilters;
  const reload = paged.reload;
  const writeError = useCurrencySlice((s) => s.error);
  const clearWriteError = useCurrencySlice((s) => s.clearError);
  const deleteCurrency = useCurrencySlice((s) => s.deleteCurrency);
  const deactivateCurrency = useCurrencySlice((s) => s.deactivateCurrency);
  const reactivateCurrency = useCurrencySlice((s) => s.reactivateCurrency);
  const bulkDeleteCurrencies = useCurrencySlice((s) => s.bulkDeleteCurrencies);
  const history = useHistoryDoor("currencies");
  const [form, setForm] = useState<{ currency: Currency | null } | null>(null);

  const { rowActions, bulkActions } = useCatalogRowActions<Currency>({
    kind: "currency",
    textKeys: "tenant_settings",
    nameValues: (currency) => ({ code: currency.code }),
    remove: deleteCurrency,
    removeMany: bulkDeleteCurrencies,
    deactivate: deactivateCurrency,
    reactivate: reactivateCurrency,
    patchRow,
    reload,
    doors: (currency) => ({
      edit: () => setForm({ currency }),
      history: () => history.open(currency.id, currency.code),
    }),
  });

  const columns: GridColDef<Currency>[] = [
    {
      field: "code",
      headerName: t("tenant_settings.code_label"),
      width: 120,
      renderCell: (params) => (
        <RowLink
          label={params.row.code}
          tabIndex={params.tabIndex}
          onClick={() => setForm({ currency: params.row })}
        />
      ),
    },
    {
      field: "name",
      headerName: t("tenant_settings.name_label"),
      flex: 1,
      minWidth: 180,
    },
    {
      field: "symbol",
      headerName: t("web.currencies.symbol"),
      width: 110,
      valueGetter: (_value, row) => row.symbol ?? "—",
    },
    {
      field: "ratePerUsd",
      headerName: t("web.currencies.rate"),
      width: 170,
      align: "right",
      headerAlign: "right",
      renderCell: (params) => (
        <MoneyText
          primary={formatRate(params.row.ratePerUsd)}
          meta={t("tenant_settings.rate_per_usd")}
        />
      ),
    },
    {
      field: "decimals",
      headerName: t("tenant_settings.decimals_label"),
      width: 140,
      align: "right",
      headerAlign: "right",
    },
    activeStatusColumn<Currency>(t),
  ];

  return (
    <Stack spacing={2}>
      <ErrorBanner message={form ? null : writeError} onDismiss={clearWriteError} />
      <DataTable<Currency>
        label={t("tenant_settings.currencies_section_title")}
        columns={columns}
        {...paged.tableProps}
        search={{
          ...paged.search,
          placeholder: t("web.currencies.search"),
        }}
        filters={
          <ActiveFilterSelect
            value={query.filters.status}
            onChange={(status) => setFilters({ status })}
          />
        }
        summary={
          <Typography variant="body2" color="text.secondary">
            <strong>USD</strong> · {t("tenant_settings.usd_base_note")}
          </Typography>
        }
        add={{ label: t("web.currencies.add"), onClick: () => setForm({ currency: null }) }}
        exportConfig={{
          nameKey: "tenant_settings.currencies_section_title",
          loadAll: () => readAllCurrencies(query),
        }}
        rowLabel={(currency) => currency.code}
        rowActions={rowActions}
        bulkActions={bulkActions}
        empty={{ title: t("tenant_settings.no_currencies"), hint: t("web.currencies.empty_hint") }}
        filtered={query.search !== "" || query.filters.status !== "all"}
      />
      {form ? (
        <CurrencyFormDialog
          currency={form.currency}
          onClose={() => setForm(null)}
          onSaved={(saved) => {
            setForm(null);
            if (form.currency) patchRow(saved);
            else reload();
          }}
        />
      ) : null}
      {history.dialog}
    </Stack>
  );
}
