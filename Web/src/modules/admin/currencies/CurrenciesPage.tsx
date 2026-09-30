import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import PauseCircleOutlined from "@mui/icons-material/PauseCircleOutlined";
import PlayCircleOutlined from "@mui/icons-material/PlayCircleOutlined";
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
import { RowLink } from "@/shared/table/RowLink";
import type { TableAction } from "@/shared/table/tableAction";
import { readAllCurrencies, useCurrenciesTable } from "@/state/currenciesTable";
import { useRecordHistoryAction } from "@/modules/admin/audit/useRecordHistoryAction";
import { CurrencyFormDialog } from "./CurrencyFormDialog";

export function CurrenciesPage() {
  const { t } = useTranslation();
  const rows = useCurrenciesTable((s) => s.rows);
  const total = useCurrenciesTable((s) => s.total);
  const loaded = useCurrenciesTable((s) => s.loaded);
  const loading = useCurrenciesTable((s) => s.loading);
  const tableError = useCurrenciesTable((s) => s.error);
  const query = useCurrenciesTable((s) => s.query);
  const load = useCurrenciesTable((s) => s.load);
  const open = useCurrenciesTable((s) => s.open);
  const patchRow = useCurrenciesTable((s) => s.patchRow);
  const setPage = useCurrenciesTable((s) => s.setPage);
  const setSearch = useCurrenciesTable((s) => s.setSearch);
  const setFilters = useCurrenciesTable((s) => s.setFilters);
  const clearFilters = useCurrenciesTable((s) => s.clearFilters);
  const clearTableError = useCurrenciesTable((s) => s.clearError);
  const writeError = useCurrencySlice((s) => s.error);
  const clearWriteError = useCurrencySlice((s) => s.clearError);
  const deleteCurrency = useCurrencySlice((s) => s.deleteCurrency);
  const deactivateCurrency = useCurrencySlice((s) => s.deactivateCurrency);
  const reactivateCurrency = useCurrencySlice((s) => s.reactivateCurrency);
  const bulkDeleteCurrencies = useCurrencySlice((s) => s.bulkDeleteCurrencies);
  const history = useRecordHistoryAction("currencies");
  const [form, setForm] = useState<{ currency: Currency | null } | null>(null);

  useEffect(() => {
    void open();
  }, [open]);

  const reload = () => void load();

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

  const statusAction = (currency: Currency): TableAction =>
    currency.active
      ? {
          key: "deactivate",
          group: "status",
          label: t("tenant_settings.deactivate"),
          icon: PauseCircleOutlined,
          destructive: true,
          onClick: () => void confirmDeactivate(currency),
        }
      : {
          key: "reactivate",
          group: "status",
          label: t("tenant_settings.reactivate"),
          icon: PlayCircleOutlined,
          onClick: () => void reactivate(currency),
        };

  const editAction = (currency: Currency): TableAction => ({
    key: "edit",
    group: "manage",
    label: t("common.edit"),
    icon: EditOutlined,
    onClick: () => setForm({ currency }),
  });

  const deleteAction = (currencies: Currency[]): TableAction => ({
    key: "delete",
    group: "danger",
    label: t("common.delete"),
    icon: DeleteOutlined,
    destructive: true,
    onClick: () => void confirmDelete(currencies),
  });

  const rowActions = (currency: Currency): TableAction[] => [
    editAction(currency),
    history.action(currency.id, currency.code),
    statusAction(currency),
    deleteAction([currency]),
  ];

  const bulkActions = (selected: Currency[]): TableAction[] =>
    selected.length === 1
      ? [editAction(selected[0]), statusAction(selected[0]), deleteAction(selected)]
      : [deleteAction(selected)];

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
        rows={rows}
        total={total}
        loaded={loaded}
        loading={loading}
        page={query.page}
        pageSize={query.pageSize}
        onPageChange={setPage}
        search={{
          value: query.search,
          onSearch: setSearch,
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
        onClearFilters={clearFilters}
        error={tableError}
        onDismissError={clearTableError}
        onReload={reload}
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
