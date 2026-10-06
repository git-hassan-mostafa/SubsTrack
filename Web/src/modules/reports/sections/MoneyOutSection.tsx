import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ExpenseItem } from "@shared/core/types";
import { useReportView } from "@shared/modules/reports/hooks/useReportView";
import { useReportsStore } from "@shared/modules/reports/state/reportsStore";
import {
  EXPENSE_DIMENSIONS,
  EXPENSE_FILTERS,
  moneyOutView,
} from "@shared/modules/reports/utils/moneyViews";
import { expenseRecords } from "@shared/modules/reports/utils/reportRecords";
import type { MoneyReport } from "@shared/modules/reports/utils/types";
import { AnalysisLayout } from "../AnalysisLayout";

export function MoneyOutSection({ report }: { report: MoneyReport }) {
  const { t } = useTranslation();
  const { view } = useReportView("money_out");
  const period = useReportsStore((s) => s.period);
  const analysis = useMemo(() => moneyOutView(report, view, period), [period, report, view]);
  return (
    <AnalysisLayout<ExpenseItem>
      section="money_out"
      kpis={analysis.kpis}
      filters={EXPENSE_FILTERS}
      dims={EXPENSE_DIMENSIONS}
      options={analysis.options}
      names={analysis.names}
      grain={analysis.grain}
      groups={analysis.groups}
      measure="money"
      countHeader={t("reports.entries")}
      toRecords={expenseRecords}
    />
  );
}
