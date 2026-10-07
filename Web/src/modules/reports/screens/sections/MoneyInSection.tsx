import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { CashRow } from "@shared/core/types";
import { useReportView } from "@shared/modules/reports/hooks/useReportView";
import { useReportsStore } from "@shared/modules/reports/state/reportsStore";
import {
  CASH_DIMENSIONS,
  CASH_FILTERS,
  moneyInView,
} from "@shared/modules/reports/utils/moneyViews";
import { cashRecords } from "@shared/modules/reports/utils/reportRecords";
import type { MoneyReport } from "@shared/modules/reports/utils/types";
import { AnalysisLayout } from "../../components/AnalysisLayout";

// Every slice of cash a bill took, by what it paid for, who took it, from whom, when.
export function MoneyInSection({ report }: { report: MoneyReport }) {
  const { t } = useTranslation();
  const { view } = useReportView("money_in");
  const period = useReportsStore((s) => s.period);
  const analysis = useMemo(() => moneyInView(report, view, period), [period, report, view]);
  return (
    <AnalysisLayout<CashRow>
      section="money_in"
      kpis={analysis.kpis}
      filters={CASH_FILTERS}
      dims={CASH_DIMENSIONS}
      options={analysis.options}
      names={analysis.names}
      grain={analysis.grain}
      groups={analysis.groups}
      measure="money"
      countHeader={t("web.reports.count_bills_paid")}
      toRecords={cashRecords}
    />
  );
}
