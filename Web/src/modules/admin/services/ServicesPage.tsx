import { useState } from "react";
import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import type { GridColDef } from "@mui/x-data-grid";
import type { Service } from "@shared/core/types";
import { useEffectiveBranchFilter } from "@shared/shared/hooks/useEffectiveBranchFilter";
import { useServiceSlice } from "@shared/state/hooks/useServiceSlice";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { MoneyText } from "@/shared/components/MoneyText";
import { useMoneyPair } from "@shared/shared/hooks/useMoneyPair";
import { ActiveFilterSelect } from "@/shared/table/ActiveFilterSelect";
import { activeStatusColumn } from "@/shared/table/activeStatusColumn";
import { DataTable } from "@/shared/table/DataTable";
import { useCatalogRowActions } from "@/shared/table/useCatalogRowActions";
import { usePagedTable } from "@/shared/table/usePagedTable";
import { RowLink } from "@/shared/table/RowLink";
import { useBranchColumn } from "@/shared/table/useBranchColumn";
import { readAllServices, useServicesTable } from "@/state/servicesTable";
import { useHistoryDoor } from "@/modules/admin/audit/useHistoryDoor";
import { ServiceFormDialog } from "./ServiceFormDialog";

export function ServicesPage() {
  const { t } = useTranslation();
  const branch = useEffectiveBranchFilter();
  const paged = usePagedTable(useServicesTable, branch);
  const query = paged.query;
  const patchRow = paged.patchRow;
  const addRow = paged.addRow;
  const setFilters = paged.setFilters;
  const reload = paged.reload;
  const writeError = useServiceSlice((s) => s.error);
  const clearWriteError = useServiceSlice((s) => s.clearError);
  const deleteService = useServiceSlice((s) => s.deleteService);
  const reactivateService = useServiceSlice((s) => s.reactivateService);
  const bulkDeleteServices = useServiceSlice((s) => s.bulkDeleteServices);
  const moneyPair = useMoneyPair();
  const branchColumn = useBranchColumn<Service>(t("branches.shared_all_branches"));
  const history = useHistoryDoor("services");
  const [form, setForm] = useState<{ service: Service | null } | null>(null);

  const { rowActions, bulkActions } = useCatalogRowActions<Service>({
    kind: "service",
    textKeys: "services",
    nameValues: (service) => ({ name: service.name }),
    remove: deleteService,
    removeMany: bulkDeleteServices,
    reactivate: reactivateService,
    patchRow,
    reload,
    doors: (service) => ({
      edit: () => setForm({ service }),
      history: () => history.open(service.id, service.name),
    }),
  });

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
        viewKey="services"
        label={t("services.title")}
        columns={columns}
        {...paged.tableProps}
        search={{
          ...paged.search,
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
      />
      {form ? (
        <ServiceFormDialog
          service={form.service}
          onClose={() => setForm(null)}
          onSaved={(saved) => {
            setForm(null);
            if (form.service) patchRow(saved);
            else addRow(saved);
          }}
        />
      ) : null}
      {history.dialog}
    </Stack>
  );
}
