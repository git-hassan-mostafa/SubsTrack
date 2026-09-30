import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import PlayCircleOutlined from "@mui/icons-material/PlayCircleOutlined";
import type { GridColDef } from "@mui/x-data-grid";
import type { Service } from "@shared/core/types";
import { confirm } from "@shared/shared/lib/confirm";
import { useEffectiveBranchFilter } from "@shared/shared/hooks/useEffectiveBranchFilter";
import { useServiceSlice } from "@shared/state/hooks/useServiceSlice";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { MoneyText } from "@/shared/components/MoneyText";
import { useMoneyPair } from "@/shared/hooks/useMoneyPair";
import { ActiveFilterSelect } from "@/shared/table/ActiveFilterSelect";
import { activeStatusColumn } from "@/shared/table/activeStatusColumn";
import { DataTable } from "@/shared/table/DataTable";
import { RowLink } from "@/shared/table/RowLink";
import type { TableAction } from "@/shared/table/tableAction";
import { useBranchColumn } from "@/shared/table/useBranchColumn";
import { readAllServices, useServicesTable } from "@/state/servicesTable";
import { useRecordHistoryAction } from "@/modules/admin/audit/useRecordHistoryAction";
import { ServiceFormDialog } from "./ServiceFormDialog";

export function ServicesPage() {
  const { t } = useTranslation();
  const rows = useServicesTable((s) => s.rows);
  const total = useServicesTable((s) => s.total);
  const loaded = useServicesTable((s) => s.loaded);
  const loading = useServicesTable((s) => s.loading);
  const tableError = useServicesTable((s) => s.error);
  const query = useServicesTable((s) => s.query);
  const load = useServicesTable((s) => s.load);
  const open = useServicesTable((s) => s.open);
  const patchRow = useServicesTable((s) => s.patchRow);
  const setPage = useServicesTable((s) => s.setPage);
  const setSearch = useServicesTable((s) => s.setSearch);
  const setFilters = useServicesTable((s) => s.setFilters);
  const clearFilters = useServicesTable((s) => s.clearFilters);
  const clearTableError = useServicesTable((s) => s.clearError);
  const writeError = useServiceSlice((s) => s.error);
  const clearWriteError = useServiceSlice((s) => s.clearError);
  const deleteService = useServiceSlice((s) => s.deleteService);
  const reactivateService = useServiceSlice((s) => s.reactivateService);
  const bulkDeleteServices = useServiceSlice((s) => s.bulkDeleteServices);
  const branch = useEffectiveBranchFilter();
  const moneyPair = useMoneyPair();
  const branchColumn = useBranchColumn<Service>(t("branches.shared_all_branches"));
  const history = useRecordHistoryAction("services");
  const [form, setForm] = useState<{ service: Service | null } | null>(null);

  useEffect(() => {
    void open(branch);
  }, [open, branch]);

  const reload = () => void load();

  const confirmDelete = (services: Service[]) => {
    const single = services.length === 1 ? services[0] : null;
    return confirm({
      title: single
        ? t("services.delete_title")
        : t("services.bulk_delete_title", { count: services.length }),
      message: single
        ? t("services.delete_message", { name: single.name })
        : t("services.bulk_delete_message", { count: services.length }),
      confirmLabel: t("common.delete"),
      destructive: true,
      onConfirm: async () => {
        const done = single
          ? (await deleteService(single.id)) !== null
          : await bulkDeleteServices(services.map((s) => s.id));
        if (done) reload();
      },
    });
  };

  const reactivate = async (service: Service) => {
    const updated = await reactivateService(service.id);
    if (updated) patchRow(updated);
  };

  const editAction = (service: Service): TableAction => ({
    key: "edit",
    group: "manage",
    label: t("common.edit"),
    icon: EditOutlined,
    onClick: () => setForm({ service }),
  });

  const reactivateAction = (service: Service): TableAction => ({
    key: "reactivate",
    group: "status",
    label: t("common.reactivate"),
    icon: PlayCircleOutlined,
    onClick: () => void reactivate(service),
  });

  const deleteAction = (services: Service[]): TableAction => ({
    key: "delete",
    group: "danger",
    label: t("common.delete"),
    icon: DeleteOutlined,
    destructive: true,
    onClick: () => void confirmDelete(services),
  });

  const rowActions = (service: Service): TableAction[] => [
    editAction(service),
    history.action(service.id, service.name),
    service.active ? deleteAction([service]) : reactivateAction(service),
  ];

  const bulkActions = (selected: Service[]): TableAction[] => {
    if (selected.length > 1) return [deleteAction(selected)];
    const one = selected[0];
    return one.active
      ? [editAction(one), deleteAction(selected)]
      : [editAction(one), reactivateAction(one), deleteAction(selected)];
  };

  const columns: GridColDef<Service>[] = [
    {
      field: "name",
      headerName: t("services.name_label"),
      flex: 1,
      minWidth: 180,
      renderCell: (params) => (
        <RowLink
          label={params.row.name}
          tabIndex={params.tabIndex}
          onClick={() => setForm({ service: params.row })}
        />
      ),
    },
    {
      field: "description",
      headerName: t("services.description_label"),
      flex: 1.5,
      minWidth: 200,
      valueGetter: (_value, row) => row.description ?? "",
    },
    ...(branchColumn ? [branchColumn] : []),
    {
      field: "price",
      headerName: t("services.price_label"),
      width: 180,
      align: "right",
      headerAlign: "right",
      renderCell: (params) => {
        const money = moneyPair(params.row.price, params.row.currencyId);
        return <MoneyText primary={money.primary} approx={money.approx} />;
      },
    },
    activeStatusColumn<Service>(t),
  ];

  return (
    <Stack spacing={2}>
      <ErrorBanner message={form ? null : writeError} onDismiss={clearWriteError} />
      <DataTable<Service>
        label={t("services.title")}
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
          placeholder: t("web.services.search"),
        }}
        filters={
          <ActiveFilterSelect
            value={query.filters.status}
            onChange={(status) => setFilters({ status })}
          />
        }
        add={{ label: t("web.services.add"), onClick: () => setForm({ service: null }) }}
        exportConfig={{ nameKey: "services.title", loadAll: () => readAllServices(query) }}
        rowLabel={(service) => service.name}
        rowActions={rowActions}
        bulkActions={bulkActions}
        empty={{ title: t("services.no_services"), hint: t("services.no_services_hint") }}
        filtered={query.search !== "" || query.filters.status !== "all"}
        onClearFilters={clearFilters}
        error={tableError}
        onDismissError={clearTableError}
        onReload={reload}
      />
      {form ? (
        <ServiceFormDialog
          service={form.service}
          onClose={() => setForm(null)}
          onSaved={(saved) => {
            setForm(null);
            if (form.service) patchRow(saved);
            else reload();
          }}
        />
      ) : null}
      {history.dialog}
    </Stack>
  );
}
