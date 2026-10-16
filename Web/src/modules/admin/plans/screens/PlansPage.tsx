import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import type { GridColDef } from "@mui/x-data-grid";
import type { Plan } from "@shared/core/types";
import { useEffectiveBranchFilter } from "@shared/shared/hooks/useEffectiveBranchFilter";
import { usePlanSlice } from "@shared/state/hooks/usePlanSlice";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { MoneyText } from "@/shared/components/MoneyText";
import { StatusChip } from "@/shared/components/StatusChip";
import { useMoneyPair } from "@shared/shared/hooks/useMoneyPair";
import { DataTable } from "@/shared/table/DataTable";
import { useCatalogRowActions } from "@/shared/table/useCatalogRowActions";
import { usePagedTable } from "@/shared/table/usePagedTable";
import { RowLink } from "@/shared/table/RowLink";
import { useBranchColumn } from "@/shared/table/useBranchColumn";
import { readAllPlans, usePlansTable } from "@/state/plansTable";
import { useHistoryDoor } from "@/modules/admin/audit/hooks/useHistoryDoor";
import { PlanFormDialog } from "../components/PlanFormDialog";
import {
  planBillingLabel,
  usageBillingLabel,
} from "@shared/modules/admin/plans/utils/planLabels";
import { UsageMonthPricesDialog } from "../components/UsageMonthPricesDialog";

export function PlansPage() {
  const { t } = useTranslation();
  const branch = useEffectiveBranchFilter();
  const paged = usePagedTable(usePlansTable, "plans", branch);
  const query = paged.query;
  const patchRow = paged.patchRow;
  const addRow = paged.addRow;
  const reload = paged.reload;
  const writeError = usePlanSlice((s) => s.error);
  const clearWriteError = usePlanSlice((s) => s.clearError);
  const deletePlan = usePlanSlice((s) => s.deletePlan);
  const bulkDeletePlans = usePlanSlice((s) => s.bulkDeletePlans);
  const moneyPair = useMoneyPair();
  const branchColumn = useBranchColumn<Plan>(t("branches.shared_all_branches"));
  const history = useHistoryDoor("plans");
  const [form, setForm] = useState<{ plan: Plan | null } | null>(null);
  const [pricesOpen, setPricesOpen] = useState(false);
  const getPlans = usePlanSlice((s) => s.getPlans);
  const anyUsagePlan = usePlanSlice((s) => s.items.some((p) => p.usage !== null));
  const hasUsagePlans = anyUsagePlan || paged.tableProps.rows.some((p) => p.usage !== null);

  useEffect(() => {
    getPlans();
  }, [getPlans]);

  const { rowActions, bulkActions } = useCatalogRowActions<Plan>({
    kind: "plan",
    textKeys: "plans",
    nameValues: (plan) => ({ name: plan.name }),
    remove: deletePlan,
    removeMany: bulkDeletePlans,
    patchRow,
    reload,
    doors: (plan) => ({
      edit: () => setForm({ plan }),
      history: () => history.open(plan.id, plan.name),
    }),
  });

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
      renderCell: (params) => {
        if (params.row.usage) {
          return <StatusChip label={usageBillingLabel(params.row.usage, t)} tone="indigo" />;
        }
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
      valueGetter: (_value, row) => planBillingLabel(row, t),
    },
  ];

  return (
    <Stack spacing={2}>
      <ErrorBanner message={form || pricesOpen ? null : writeError} onDismiss={clearWriteError} />
      <DataTable<Plan>
        label={t("plans.title")}
        columns={columns}
        {...paged.tableProps}
        search={{
          ...paged.search,
          placeholder: t("web.plans.search"),
        }}
        toolbarActions={
          hasUsagePlans ? (
            <Button
              variant="outlined"
              startIcon={<CalendarMonthOutlined />}
              onClick={() => setPricesOpen(true)}
            >
              {t("plans.month_prices_title")}
            </Button>
          ) : null
        }
        add={{ label: t("web.plans.add"), onClick: () => setForm({ plan: null }) }}
        exportConfig={{ nameKey: "plans.title", loadAll: () => readAllPlans(query) }}
        rowLabel={(plan) => plan.name}
        rowActions={rowActions}
        bulkActions={bulkActions}
        empty={{ title: t("plans.no_plans"), hint: t("web.plans.empty_hint") }}
        filtered={query.search !== ""}
      />
      {form ? (
        <PlanFormDialog
          plan={form.plan}
          onClose={() => setForm(null)}
          onSaved={(saved) => {
            setForm(null);
            if (form.plan) patchRow(saved);
            else addRow(saved);
          }}
        />
      ) : null}
      {pricesOpen ? <UsageMonthPricesDialog onClose={() => setPricesOpen(false)} /> : null}
      {history.dialog}
    </Stack>
  );
}
