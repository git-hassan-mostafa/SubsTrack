import i18n from "@shared/core/i18n";
import type { Currency } from "@shared/core/types";
import { findCurrency } from "@shared/core/utils/currency";
import { expenseCategoryLabelKey } from "@shared/modules/transaction/expenses/utils/expenseCategories";
import type { CsvTable } from "@shared/shared/lib/csv";
import type { ReportGroup } from "./analysis";
import type { DebtsReport, MoneyReport, RecordRow } from "./types";

export type { CsvTable };

const code = (currencies: Currency[], id: string | null): string =>
  findCurrency(currencies, id)?.code ?? "USD";

// Fixed 2dp and a plain '.' separator — a locale-formatted number would carry
// thousands separators straight into the CSV and split a cell in two.
const num = (n: number): string => n.toFixed(2);

/**
 * Both money sources in one sheet — cash in as positive rows, spending as
 * negative — so the file's Amount column sums to the report's Net.
 */
export function moneyCsv(data: MoneyReport, currencies: Currency[]): CsvTable {
  const t = i18n.t.bind(i18n);
  return {
    headers: [
      t("reports.col_date"),
      t("reports.col_type"),
      t("reports.col_customer"),
      t("reports.col_detail"),
      t("reports.col_amount"),
      t("reports.col_currency"),
      t("reports.col_usd"),
    ],
    rows: [
      ...data.cash.map((r) => [
        r.date,
        t(`reports.stream_${r.stream}`),
        r.customerName ?? "",
        r.label ?? "",
        num(r.amount),
        code(currencies, r.currencyId),
        num(r.amount / r.ratePerUsdSnapshot),
      ]),
      ...data.expenses.map((e) => [
        e.date,
        t(expenseCategoryLabelKey(e.category)),
        "",
        e.label,
        num(-e.amount),
        code(currencies, e.currencyId),
        num(-e.amount / e.ratePerUsdSnapshot),
      ]),
    ],
  };
}

// The rows behind one number, in their own currency with the frozen USD beside it.
export function recordsCsv(rows: readonly RecordRow[], currencies: Currency[]): CsvTable {
  const t = i18n.t.bind(i18n);
  return {
    headers: [
      t("reports.col_date"),
      t("reports.col_name"),
      t("reports.col_detail"),
      t("reports.col_amount"),
      t("reports.col_currency"),
      t("reports.col_usd"),
    ],
    rows: rows.map((r) => [
      r.date.slice(0, 10),
      r.title,
      r.subtitle ?? "",
      num(r.amount),
      code(currencies, r.currencyId),
      num(r.amount / r.ratePerUsdSnapshot),
    ]),
  };
}

// The table as shown: one line per group, the value in USD so the sheet can be summed.
export function groupsCsv<R>(
  groups: readonly ReportGroup<R>[],
  headers: { dim: string; count: string; value: string; share: string },
  label: (key: string) => string,
): CsvTable {
  return {
    headers: [headers.dim, headers.count, headers.value, headers.share],
    rows: groups.map((g) => [
      label(g.key),
      g.count,
      num(g.value),
      `${Math.round(g.share * 100)}%`,
    ]),
  };
}

/** One row per customer who is behind, worst first. */
export function debtsCsv(data: DebtsReport): CsvTable {
  const t = i18n.t.bind(i18n);
  const owedByCustomer = new Map(
    data.topDebtors.map((d) => [d.customerId, d.debtUsd]),
  );
  return {
    headers: [
      t("reports.col_customer"),
      t("reports.col_months_behind"),
      t("reports.col_owed_usd"),
    ],
    rows: data.aging.map((a) => [
      a.customerName,
      a.months,
      owedByCustomer.has(a.customerId)
        ? num(owedByCustomer.get(a.customerId)!)
        : "",
    ]),
  };
}
