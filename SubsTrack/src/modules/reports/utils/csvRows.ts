import i18n from '@/src/core/i18n';
import type { Currency } from '@/src/core/types';
import { findCurrency } from '@/src/core/utils/currency';
import { expenseCategoryLabelKey } from '@/src/modules/transaction/expenses/utils/expenseCategories';
import type { DebtsReport, MoneyReport } from './types';

export interface CsvTable {
  headers: string[];
  rows: (string | number | null)[][];
}

const code = (currencies: Currency[], id: string | null): string =>
  findCurrency(currencies, id)?.code ?? 'USD';

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
      t('reports.col_date'),
      t('reports.col_type'),
      t('reports.col_customer'),
      t('reports.col_detail'),
      t('reports.col_amount'),
      t('reports.col_currency'),
      t('reports.col_usd'),
    ],
    rows: [
      ...data.cash.map((r) => [
        r.date,
        t(`reports.stream_${r.stream}`),
        r.customerName ?? '',
        r.label ?? '',
        num(r.amount),
        code(currencies, r.currencyId),
        num(r.amount / r.ratePerUsdSnapshot),
      ]),
      ...data.expenses.map((e) => [
        e.date,
        t(expenseCategoryLabelKey(e.category)),
        '',
        e.label,
        num(-e.amount),
        code(currencies, e.currencyId),
        num(-e.amount / e.ratePerUsdSnapshot),
      ]),
    ],
  };
}

/** One row per customer who is behind, worst first. */
export function debtsCsv(data: DebtsReport): CsvTable {
  const t = i18n.t.bind(i18n);
  const owedByCustomer = new Map(data.topDebtors.map((d) => [d.customerId, d.debtUsd]));
  return {
    headers: [
      t('reports.col_customer'),
      t('reports.col_months_behind'),
      t('reports.col_owed_usd'),
    ],
    rows: data.aging.map((a) => [
      a.customerName,
      a.months,
      owedByCustomer.has(a.customerId) ? num(owedByCustomer.get(a.customerId)!) : '',
    ]),
  };
}
