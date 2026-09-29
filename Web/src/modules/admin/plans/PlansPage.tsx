import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import type { GridColDef } from "@mui/x-data-grid";
import type { Plan } from "@shared/core/types";
import { confirm } from "@shared/shared/lib/confirm";
import { useEffectiveBranchFilter } from "@shared/shared/hooks/useEffectiveBranchFilter";
import { usePlanSlice } from "@shared/state/hooks/usePlanSlice";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { MoneyText } from "@/shared/components/MoneyText";
import { StatusChip } from "@/shared/components/StatusChip";
import { useMoneyPair } from "@/shared/hooks/useMoneyPair";
import { DataTable } from "@/shared/table/DataTable";
import { RowLink } from "@/shared/table/RowLink";
import type { TableAction } from "@/shared/table/tableAction";
import { useBranchColumn } from "@/shared/table/useBranchColumn";
import { readAllPlans, usePlansTable } from "@/state/plansTable";
import { useRecordHistoryAction } from "@/modules/admin/audit/useRecordHistoryAction";
import { PlanFormDialog } from "./PlanFormDialog";
import { usePlanDurationLabel } from "./usePlanDurationLabel";

export function PlansPage() {
  const { t } = useTranslation();
  const rows = usePlansTable((s) => s.rows);
  const total = usePlansTable((s) => s.total);
  const loaded = usePlansTable((s) => s.loaded);
  const loading = usePlansTable((s) => s.loading);
  const tableError = usePlansTable((s) => s.error);
  const query = usePlansTable((s) => s.query);
  const load = usePlansTable((s) => s.load);
  const open = usePlansTable((s) => s.open);
  const setPage = usePlansTable((s) => s.setPage);
  const setSearch = usePlansTable((s) => s.setSearch);
  const clearFilters = usePlansTable((s) => s.clearFilters);
  const clearTableError = usePlansTable((s) => s.clearError);
  const writeError = usePlanSlice((s) => s.error);
  const clearWriteError = usePlanSlice((s) => s.clearError);
  const deletePlan = usePlanSlice((s) => s.deletePlan);
  const bulkDeletePlans = usePlanSlice((s) => s.bulkDeletePlans);
  const branch = useEffectiveBranchFilter();
  const moneyPair = useMoneyPair();
  const durationLabel = usePlanDurationLabel();
  const branchColumn = useBranchColumn<Plan>(t("branches.shared_all_branches"));
  const history = useRecordHistoryAction("plans");
  const [form, setForm] = useState<{ plan: Plan | null } | null>(null);

  useEffect(() => {
    void open(branch);
  }, [open, branch]);

  const reload = () => void load();

  const confirmDelete = (plans: Plan[]) => {
    const single = plans.length === 1 ? plans[0] : null;
    return confirm({
      title: single ? t("plans.delete_title") : t("plans.bulk_delete_title", { count: plans.length }),
      message: single
        ? t("plans.delete_message", { name: single.name })
        : t("plans.bulk_delete_message", { count: plans.length }),
      confirmLabel: t("common.delete"),
      destructive: true,
      onConfirm: async () => {
        const done = single
          ? await deletePlan(single.id)
          : await bulkDeletePlans(plans.map((p) => p.id));
        if (done) reload();
      },
    });
  };

  const editAction = (plan: Plan): TableAction => ({
    key: "edit",
    group: "manage",
    label: t("common.edit"),
    icon: EditOutlined,
    onClick: () => setForm({ plan }),
  });

  const deleteAction = (plans: Plan[]): TableAction => ({
    key: "delete",
    group: "danger",
    label: t("common.delete"),
    icon: DeleteOutlined,
    destructive: true,
    onClick: () => void confirmDelete(plans),
  });

  const rowActions = (plan: Plan): TableAction[] => [
    editAction(plan),
    history.action(plan.id, plan.name),
    deleteAction([plan]),
  ];

  const bulkActions = (selected: Plan[]): TableAction[] =>
    selected.length === 1
      ? [editAction(selected[0]), deleteAction(selected)]
      : [deleteAction(selected)];

  const columns: GridColDef<Plan>[] = [
    {
      field: "name",
      headerName: t("plans.plan_name_label"),
      flex: 1,
      minWidth: 200,
      renderCell: (params) => (
        <RowLink
          label={params.row.name}
          tabIndex={params.tabIndex}
          onClick={() => setForm({ plan: params.row })}
        />
      ),
    },
    ...(branchColumn ? [branchColumn] : []),
    {
      field: "price",
      headerName: t("plans.price_label"),
      width: 180,
      align: "right",
      headerAlign: "right",
      renderCell: (params) => {
        if (params.row.isCustomPrice || params.row.price === null) {
          return <StatusChip label={t("common.custom")} tone="indigo" />;
        }
        const money = moneyPair(params.row.price, params.row.currencyId);
        return <MoneyText primary={money.primary} approx={money.approx} />;
      },
    },
    {
      field: "durationMonths",
      headerName: t("web.plans.billing"),
      width: 160,
      valueGetter: (_value, row) => durationLabel(row.durationMonths),
    },
  ];

  return (
    <Stack spacing={2}>
      <ErrorBanner message={form ? null : writeError} onDismiss={clearWriteError} />
      <DataTable<Plan>
        label={t("plans.title")}
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
          placeholder: t("web.plans.search"),
        }}
        add={{ label: t("web.plans.add"), onClick: () => setForm({ plan: null }) }}
        exportConfig={{ nameKey: "plans.title", loadAll: () => readAllPlans(query) }}
        rowLabel={(plan) => plan.name}
        rowActions={rowActions}
        bulkActions={bulkActions}
        empty={{ title: t("plans.no_plans"), hint: t("web.plans.empty_hint") }}
        filtered={query.search !== ""}
        onClearFilters={clearFilters}
        error={tableError}
        onDismissError={clearTableError}
        onRetry={reload}
      />
      {form ? (
        <PlanFormDialog
          plan={form.plan}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            reload();
          }}
        />
      ) : null}
      {history.dialog}
    </Stack>
  );
}
