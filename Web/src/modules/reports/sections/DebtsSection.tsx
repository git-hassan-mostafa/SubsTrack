import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { GridColDef } from "@mui/x-data-grid";
import type { OpenItem } from "@shared/core/types";
import { useReportView } from "@shared/modules/reports/hooks/useReportView";
import { useReportsStore } from "@shared/modules/reports/state/reportsStore";
import {
  DEBT_DIMENSIONS,
  DEBT_FILTERS,
  debtsAnalysis,
} from "@shared/modules/reports/utils/debtsView";
import { debtItemRecords } from "@shared/modules/reports/utils/reportRecords";
import type { DebtsReport } from "@shared/modules/reports/utils/types";
import { AnalysisLayout } from "../AnalysisLayout";
import type { GroupRow } from "../BreakdownTable";

// What is owed has no period: only "collected on debts" follows it — gotcha #91.
export function DebtsSection({ report }: { report: DebtsReport }) {
  const { t } = useTranslation();
  const { view } = useReportView("debts");
  const period = useReportsStore((s) => s.period);
  const analysis = useMemo(() => debtsAnalysis(report, view, period), [period, report, view]);

  const customerColumns = useMemo<GridColDef<GroupRow<OpenItem>>[]>(
    () =>
      view.groupBy === "customer"
        ? [
            {
              field: "monthsBehind",
              headerName: t("reports.col_months_behind"),
              width: 150,
              align: "right",
              headerAlign: "right",
              valueGetter: (_value, row) => analysis.monthsBehind.get(row.key) ?? 0,
            },
            {
              field: "daysLate",
              headerName: t("web.reports.oldest_days_late"),
              width: 150,
              align: "right",
              headerAlign: "right",
              valueGetter: (_value, row) => analysis.oldestDaysLate.get(row.key) ?? 0,
            },
          ]
        : [],
    [analysis.monthsBehind, analysis.oldestDaysLate, t, view.groupBy],
  );

  return (
    <AnalysisLayout<OpenItem>
      section="debts"
      kpis={analysis.kpis}
      filters={DEBT_FILTERS}
      dims={DEBT_DIMENSIONS}
      options={analysis.options}
      names={analysis.names}
      grain={analysis.grain}
      groups={analysis.groups}
      measure="money"
      countHeader={t("reports.open_bills")}
      valueHeader={t("reports.outstanding")}
      extraColumns={customerColumns}
      toRecords={debtItemRecords}
      recordsNote={t("web.reports.debt_records_note")}
    />
  );
}
