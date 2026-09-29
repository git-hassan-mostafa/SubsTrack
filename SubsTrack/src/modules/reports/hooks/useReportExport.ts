import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Currency } from "@shared/core/types";
import type { ReportPeriod } from "@shared/core/utils/dateRange";
import { exportCsv } from "@/src/shared/lib/exportCsv";
import type { ReportSection } from "@/src/modules/reports/state/reportsStore";
import { debtsCsv, moneyCsv } from "@shared/modules/reports/utils/csvRows";
import type { DebtsReport, MoneyReport } from "@shared/modules/reports/utils/types";

/**
 * Turns whichever section is on screen into a CSV and hands it to the OS.
 * One seam, so adding a phase-2 section is one more case here plus its builder
 * — never new export plumbing.
 */
export function useReportExport() {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState(false);

  const exportSection = async (
    section: ReportSection,
    period: ReportPeriod,
    money: MoneyReport | null,
    debts: DebtsReport | null,
    currencies: Currency[],
  ): Promise<boolean> => {
    const table =
      section === "money"
        ? money && moneyCsv(money, currencies)
        : debts && debtsCsv(debts);
    if (!table) return false;

    setExporting(true);
    try {
      const name = `${t(`reports.csv_${section}`)}-${period.fromDate}-${period.toDate}`;
      return await exportCsv(name, table.headers, table.rows);
    } catch {
      return false;
    } finally {
      setExporting(false);
    }
  };

  return { exporting, exportSection };
}
