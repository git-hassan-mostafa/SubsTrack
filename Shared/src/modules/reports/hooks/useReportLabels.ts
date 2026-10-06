import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { ExpenseCategory } from "@shared/core/types";
import { findCurrency } from "@shared/core/utils/currency";
import { formatDate } from "@shared/core/utils/date";
import { NO_KEY } from "@shared/modules/reports/utils/analysis";
import { CUSTOM_PRICE_KEY } from "@shared/modules/reports/utils/customersView";
import type { ReportDimension } from "@shared/modules/reports/utils/reportDimensions";
import type { TimeGrain } from "@shared/modules/reports/utils/timeBuckets";
import { expenseCategoryLabelKey } from "@shared/modules/transaction/expenses/utils/expenseCategories";
import { useUserNames } from "@shared/shared/hooks/useUserNames";
import { useBranchSlice } from "@shared/state/hooks/useBranchSlice";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { usePlanSlice } from "@shared/state/hooks/usePlanSlice";

export interface LabelContext {
  names: ReadonlyMap<string, string>;
  grain: TimeGrain;
}

export type ReportLabeler = (dim: ReportDimension, key: string, context: LabelContext) => string;

const NONE_LABEL_KEY: Partial<Record<ReportDimension, string>> = {
  collector: "common.unknown",
  recorded_by: "common.unknown",
  customer: "reports.no_customer",
  plan: "reports.no_plan",
  branch: "reports.no_branch",
  area: "reports.no_area",
  item: "reports.no_items",
  line_type: "reports.no_items",
};

const localDay = (day: string) => `${day}T00:00:00`;

// Group keys are ids and codes; this is the one place that turns them into words.
export function useReportLabels(): ReportLabeler {
  const { t } = useTranslation();
  const userName = useUserNames();
  const plans = usePlanSlice((s) => s.items);
  const getPlans = usePlanSlice((s) => s.getPlans);
  const branches = useBranchSlice((s) => s.items);
  const getBranches = useBranchSlice((s) => s.getBranches);
  const currencies = useCurrencySlice((s) => s.items);
  const getCurrencies = useCurrencySlice((s) => s.getCurrencies);

  useEffect(() => {
    void getPlans();
    void getBranches();
    void getCurrencies();
  }, [getBranches, getCurrencies, getPlans]);

  return useCallback<ReportLabeler>(
    (dim, key, { names, grain }) => {
      if (key === NO_KEY) {
        if (dim === "currency") return "USD";
        return t(NONE_LABEL_KEY[dim] ?? "common.unknown");
      }
      switch (dim) {
        case "stream":
        case "kind":
          return t(`reports.stream_${key}`);
        case "collector":
        case "recorded_by":
          return userName(key) ?? t("common.unknown");
        case "customer":
        case "item":
          return names.get(key) ?? t("common.unknown");
        case "plan":
          if (key === CUSTOM_PRICE_KEY) return t("reports.special_price");
          return plans.find((plan) => plan.id === key)?.name ?? t("common.unknown");
        case "currency":
          return findCurrency(currencies, key)?.code ?? t("common.unknown");
        case "branch":
          return branches.find((branch) => branch.id === key)?.name ?? t("common.unknown");
        case "category":
          return t(expenseCategoryLabelKey(key as ExpenseCategory));
        case "time":
          if (grain === "month")
            return formatDate(localDay(key), { month: "short", year: "numeric" });
          if (grain === "week")
            return t("reports.week_of", { date: formatDate(localDay(key)) });
          return formatDate(localDay(key));
        case "area":
          return key;
        default:
          return t(`reports.${dim}_${key}`);
      }
    },
    [branches, currencies, plans, t, userName],
  );
}
