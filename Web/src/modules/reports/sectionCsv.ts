import i18n from "@shared/core/i18n";
import type { Currency } from "@shared/core/types";
import { formatDate } from "@shared/core/utils/date";
import { customersAnalysis } from "@shared/modules/reports/utils/customersView";
import { debtsAnalysis } from "@shared/modules/reports/utils/debtsView";
import { moneyCsv, recordsCsv } from "@shared/modules/reports/utils/csvRows";
import { moneyInView, moneyOutView } from "@shared/modules/reports/utils/moneyViews";
import {
  cashRecords,
  debtItemRecords,
  expenseRecords,
  saleRecords,
} from "@shared/modules/reports/utils/reportRecords";
import type { ReportSection } from "@shared/modules/reports/utils/reportSections";
import type { SectionViewState } from "@shared/modules/reports/utils/reportDimensions";
import { salesAnalysis } from "@shared/modules/reports/utils/salesView";
import type { ReportsState } from "@shared/modules/reports/state/reportsStore";
import type { CsvTable } from "@shared/shared/lib/csv";

type Held = Pick<ReportsState, "money" | "debts" | "customers" | "sales" | "period" | "views">;

// Every row the section shows under its filters; staff exports its own table.
export function sectionCsv(
  section: ReportSection,
  held: Held,
  currencies: Currency[],
): CsvTable | null {
  const view = (key: ReportSection): SectionViewState => held.views[key];
  const { money, debts, customers, sales, period } = held;
  switch (section) {
    case "money":
      return money && moneyCsv(money, currencies);
    case "money_in":
      return money && recordsCsv(cashRecords(moneyInView(money, view(section), period).rows), currencies);
    case "money_out":
      return money && recordsCsv(expenseRecords(moneyOutView(money, view(section), period).rows), currencies);
    case "debts":
      return debts && recordsCsv(debtItemRecords(debtsAnalysis(debts, view(section), period).rows), currencies);
    case "sales":
      return (
        sales &&
        recordsCsv(saleRecords(salesAnalysis(sales, money?.cash ?? null, view(section), period).sales), currencies)
      );
    case "customers": {
      if (!customers) return null;
      const t = i18n.t.bind(i18n);
      const rows = customersAnalysis(customers, view(section), period, currencies).rows;
      return {
        headers: [
          t("reports.col_name"),
          t("web.users.phone"),
          t("reports.dim_area"),
          t("reports.dim_status"),
          t("web.reports.joined_on"),
          t("web.reports.left_on"),
        ],
        rows: rows.map((c) => [
          c.name,
          c.phoneNumber ?? "",
          c.area ?? "",
          t(c.active ? "reports.status_active" : "reports.status_cancelled"),
          formatDate(c.createdAt),
          c.cancelledAt && !c.active ? formatDate(c.cancelledAt) : "",
        ]),
      };
    }
    case "staff":
      return null;
  }
}
