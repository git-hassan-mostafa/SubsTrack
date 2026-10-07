import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { GridColDef } from "@mui/x-data-grid";
import type { Sale } from "@shared/core/types";
import { useReportView } from "@shared/modules/reports/hooks/useReportView";
import { useReportsStore } from "@shared/modules/reports/state/reportsStore";
import { saleRecords } from "@shared/modules/reports/utils/reportRecords";
import {
  SALE_DIMENSIONS,
  SALE_FILTERS,
  saleLineRecords,
  salesAnalysis,
  unitsOf,
  type SaleLineRow,
} from "@shared/modules/reports/utils/salesView";
import type { MoneyReport, SalesReport } from "@shared/modules/reports/utils/types";
import { AnalysisLayout } from "../../components/AnalysisLayout";
import type { GroupRow } from "../../components/BreakdownTable";

interface SalesSectionProps {
  report: SalesReport;
  money: MoneyReport | null;
}

// Item rows add line prices, which only suggest the typed total — gotcha #142.
export function SalesSection({ report, money }: SalesSectionProps) {
  const { t } = useTranslation();
  const { view } = useReportView("sales");
  const period = useReportsStore((s) => s.period);
  const analysis = useMemo(
    () => salesAnalysis(report, money?.cash ?? null, view, period),
    [money, period, report, view],
  );
  const unitColumns = useMemo<GridColDef<GroupRow<SaleLineRow>>[]>(
    () => [
      {
        field: "units",
        headerName: t("reports.units_sold"),
        width: 120,
        valueGetter: (_value, row) => unitsOf(row.rows),
      },
    ],
    [t],
  );

  const shared = {
    section: "sales" as const,
    kpis: analysis.kpis,
    filters: SALE_FILTERS,
    dims: SALE_DIMENSIONS,
    options: analysis.options,
    names: analysis.names,
    grain: analysis.grain,
    measure: "money" as const,
  };

  if (analysis.grouped.level === "line") {
    return (
      <AnalysisLayout<SaleLineRow>
        {...shared}
        groups={analysis.grouped.groups}
        countHeader={t("web.reports.count_lines")}
        valueHeader={t("web.reports.line_value")}
        extraColumns={unitColumns}
        toRecords={saleLineRecords}
        recordsNote={t("web.reports.line_value_note")}
      />
    );
  }
  return (
    <AnalysisLayout<Sale>
      {...shared}
      groups={analysis.grouped.groups}
      countHeader={t("reports.sales_count")}
      valueHeader={t("reports.sold_value")}
      toRecords={saleRecords}
    />
  );
}
