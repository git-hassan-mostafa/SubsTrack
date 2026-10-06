import i18n from "@shared/core/i18n";
import type { CashRow, ExpenseItem, OpenItem, Sale } from "@shared/core/types";
import { sumUsd } from "@shared/core/utils/currency";
import { receiptId } from "@shared/core/utils/receiptId";
import type { RecordRow } from "@shared/modules/reports/utils/types";

export interface RecordsTotal {
  rows: RecordRow[];
  totalUsd: number;
}

export function withTotal(rows: RecordRow[]): RecordsTotal {
  return { rows, totalUsd: sumUsd(rows) };
}

export function cashRecords(rows: readonly CashRow[]): RecordRow[] {
  return rows.map((r) => ({
    id: `${r.stream}:${r.id}`,
    title: r.customerName ?? r.label ?? i18n.t(`reports.stream_${r.stream}`),
    subtitle: r.customerName ? r.label : null,
    date: r.date,
    amount: r.amount,
    currencyId: r.currencyId,
    ratePerUsdSnapshot: r.ratePerUsdSnapshot,
    customerId: r.customerId,
  }));
}

export function debtCollectedRecords(rows: readonly CashRow[]): RecordRow[] {
  return rows.map((r) => ({
    id: r.id,
    title: r.customerName ?? i18n.t("reports.debt_collected"),
    subtitle: r.label,
    date: r.date,
    amount: r.amount,
    currencyId: r.currencyId,
    ratePerUsdSnapshot: r.ratePerUsdSnapshot,
    customerId: r.customerId,
  }));
}

export function expenseRecords(rows: readonly ExpenseItem[]): RecordRow[] {
  return rows.map((e) => ({
    id: e.id,
    title: e.label,
    subtitle: null,
    date: e.date,
    amount: e.amount,
    currencyId: e.currencyId,
    ratePerUsdSnapshot: e.ratePerUsdSnapshot,
  }));
}

// What is still owed on each bill, dated by when it fell due.
export function debtItemRecords(items: readonly OpenItem[]): RecordRow[] {
  return items.map((item, i) => ({
    id: item.chargeId ?? `${item.customerId}:${i}`,
    title: item.customerName,
    subtitle: item.label,
    date: item.dueDate,
    amount: item.balance,
    currencyId: item.currencyId,
    ratePerUsdSnapshot: item.ratePerUsdSnapshot,
    customerId: item.customerId,
  }));
}

// The typed total, never the line sum — gotcha #142.
export function saleRecords(sales: readonly Sale[]): RecordRow[] {
  return sales.map((sale) => ({
    id: sale.id,
    title: sale.customer?.name
      ? `#${receiptId(sale.id)} · ${sale.customer.name}`
      : `#${receiptId(sale.id)}`,
    subtitle: sale.itemsSummary || i18n.t("sales.no_items_summary"),
    date: sale.soldAt,
    amount: sale.totalAmount,
    currencyId: sale.currencyId,
    ratePerUsdSnapshot: sale.ratePerUsdSnapshot,
    customerId: sale.customerId,
  }));
}
