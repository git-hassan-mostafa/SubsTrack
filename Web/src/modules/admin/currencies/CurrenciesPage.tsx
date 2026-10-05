import { useState } from "react";
import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { GridColDef } from "@mui/x-data-grid";
import type { Currency } from "@shared/core/types";
import { formatRate } from "@shared/core/utils/currency";
import { confirm } from "@shared/shared/lib/confirm";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { MoneyText } from "@/shared/components/MoneyText";
import { ActiveFilterSelect } from "@/shared/table/ActiveFilterSelect";
import { activeStatusColumn } from "@/shared/table/activeStatusColumn";
import { DataTable } from "@/shared/table/DataTable";
import { usePagedTable } from "@/shared/table/usePagedTable";
import { RowLink } from "@/shared/table/RowLink";
import { toTableActions, type TableAction } from "@/shared/table/tableAction";
import { CATALOG_ACTION_ICONS } from "@/shared/table/catalogActionIcons";
import {
  catalogRowActions,
  catalogSelectionActions,
  type CatalogActionKey,
} from "@shared/shared/lib/catalogMenu";
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

  const confirmDeactivate = (currency: Currency) =>
    confirm({
      title: t("tenant_settings.deactivate_title"),
      message: t("tenant_settings.deactivate_message", { code: currency.code }),
      destructive: true,
      onConfirm: async () => {
        const updated = await deactivateCurrency(currency.id);
        if (updated) patchRow(updated);
      },
    });

  const confirmDelete = (currencies: Currency[]) => {
    const single = currencies.length === 1 ? currencies[0] : null;
    return confirm({
      title: single
        ? t("tenant_settings.delete_title")
        : t("tenant_settings.bulk_delete_title", { count: currencies.length }),
      message: single
        ? t("tenant_settings.delete_message", { code: single.code })
        : t("tenant_settings.bulk_delete_message", { count: currencies.length }),
      confirmLabel: t("common.delete"),
      destructive: true,
      onConfirm: async () => {
        const done = single
          ? (await deleteCurrency(single.id)) !== null
          : await bulkDeleteCurrencies(currencies.map((c) => c.id));
        if (done) reload();
      },
    });
  };

  const reactivate = async (currency: Currency) => {
    const updated = await reactivateCurrency(currency.id);
    if (updated) patchRow(updated);
  };

  const runFor = (currency: Currency): Partial<Record<CatalogActionKey, () => void>> => ({
    edit: () => setForm({ currency }),
    history: () => history.open(currency.id, currency.code),
    deactivate: () => void confirmDeactivate(currency),
    reactivate: () => void reactivate(currency),
  });

  const rowActions = (currency: Currency): TableAction[] =>
    toTableActions(catalogRowActions("currency", currency), t, {
      icons: CATALOG_ACTION_ICONS,
      run: { ...runFor(currency), delete: () => void confirmDelete([currency]) },
    });

  const bulkActions = (selected: Currency[]): TableAction[] =>
    toTableActions(catalogSelectionActions("currency", selected), t, {
      icons: CATALOG_ACTION_ICONS,
      run: {
        ...(selected.length === 1 ? runFor(selected[0]) : {}),
        delete: () => void confirmDelete(selected),
      },
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
