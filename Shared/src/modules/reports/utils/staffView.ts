import type { CashRow, ExpenseItem, Sale } from "@shared/core/types";
import { NO_KEY } from "@shared/modules/reports/utils/analysis";
import { count, money, type ReportKpi } from "@shared/modules/reports/utils/reportKpis";
import { snapshotUsd } from "@shared/core/utils/currency";
import { saleUsd } from "@shared/modules/reports/utils/salesView";
import type { MoneyReport, SalesReport } from "@shared/modules/reports/utils/types";

export interface StaffRow {
  id: string;
  collectedUsd: number;
  handOvers: number;
  salesCount: number;
  soldUsd: number;
  spentUsd: number;
  cash: CashRow[];
  sales: Sale[];
  expenses: ExpenseItem[];
}

export interface StaffAnalysis {
  kpis: ReportKpi[];
  rows: StaffRow[];
}

function emptyRow(id: string): StaffRow {
  return {
    id,
    collectedUsd: 0,
    handOvers: 0,
    salesCount: 0,
    soldUsd: 0,
    spentUsd: 0,
    cash: [],
    sales: [],
    expenses: [],
  };
}

// Who took the cash, who rang up the sale, who wrote down the spending — one row each.
export function staffAnalysis(
  moneyReport: Pick<MoneyReport, "cash" | "expenses">,
  sales: Pick<SalesReport, "sales">,
): StaffAnalysis {
  const rows = new Map<string, StaffRow>();
  const rowOf = (userId: string | null) => {
    const id = userId ?? NO_KEY;
    const row = rows.get(id) ?? emptyRow(id);
    rows.set(id, row);
    return row;
  };
  for (const cash of moneyReport.cash) {
    const row = rowOf(cash.receivedByUserId);
    row.collectedUsd += snapshotUsd(cash);
    row.cash.push(cash);
  }
  for (const sale of sales.sales) {
    const row = rowOf(sale.recordedByUserId);
    row.salesCount += 1;
    row.soldUsd += saleUsd(sale);
    row.sales.push(sale);
  }
  for (const expense of moneyReport.expenses) {
    const row = rowOf(expense.recordedByUserId);
    row.spentUsd += snapshotUsd(expense);
    row.expenses.push(expense);
  }
  const list = [...rows.values()].map((row) => ({
    ...row,
    handOvers: new Set(row.cash.map((c) => c.collectionId)).size,
  }));
  list.sort((a, b) => b.collectedUsd - a.collectedUsd || b.soldUsd - a.soldUsd);
  const people = list.filter((row) => row.id !== NO_KEY).length;
  return {
    kpis: [
      { key: "people", labelKey: "reports.staff_active", value: count(people), tone: "indigo" },
      {
        key: "collected",
        labelKey: "reports.collected",
        value: money(list.reduce((sum, row) => sum + row.collectedUsd, 0)),
        tone: "emerald",
      },
      {
        key: "sold",
        labelKey: "reports.sold_value",
        value: money(list.reduce((sum, row) => sum + row.soldUsd, 0)),
        tone: "gray",
      },
    ],
    rows: list,
  };
}
