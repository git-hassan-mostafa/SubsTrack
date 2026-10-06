import type { CashRow, Sale, SaleItem } from "@shared/core/types";
import type { ReportPeriod } from "@shared/core/utils/dateRange";
import { delta } from "@shared/modules/reports/utils/aggregate";
import {
  applyFilter,
  filterOptions,
  groupRows,
  NO_KEY,
  type KeyOf,
  type ReportGroup,
} from "@shared/modules/reports/utils/analysis";
import {
  namesFrom,
  withoutTime,
  type DimensionFilter,
  type SectionViewState,
} from "@shared/modules/reports/utils/reportDimensions";
import { count, money, ratioOf, type ReportKpi } from "@shared/modules/reports/utils/reportKpis";
import { snapshotUsd } from "@shared/core/utils/currency";
import {
  bucketOf,
  defaultGrain,
  periodBuckets,
  type TimeGrain,
} from "@shared/modules/reports/utils/timeBuckets";
import { savedProductLines } from "@shared/modules/transaction/sales/utils/saleLines";
import type { RecordRow, SalesReport } from "@shared/modules/reports/utils/types";
import { receiptId } from "@shared/core/utils/receiptId";

export const SALE_DIMENSIONS = [
  "item",
  "line_type",
  "recorded_by",
  "customer",
  "branch",
  "time",
] as const;

export type SaleDimension = (typeof SALE_DIMENSIONS)[number];

export const SALE_FILTERS: readonly SaleDimension[] = ["item", "line_type", "recorded_by", "customer"];

const LINE_DIMENSIONS: readonly SaleDimension[] = ["item", "line_type"];

export interface SaleLineRow {
  id: string;
  sale: Sale;
  item: SaleItem;
}

export type SalesGroups =
  | { level: "sale"; groups: ReportGroup<Sale>[] }
  | { level: "line"; groups: ReportGroup<SaleLineRow>[] };

export interface SalesAnalysis {
  kpis: ReportKpi[];
  grouped: SalesGroups;
  sales: Sale[];
  lines: SaleLineRow[];
  options: Partial<Record<SaleDimension, string[]>>;
  names: ReadonlyMap<string, string>;
  grain: TimeGrain;
}

export function saleItemKey(item: SaleItem): string {
  if (item.productId) return `product:${item.productId}`;
  if (item.serviceId) return `service:${item.serviceId}`;
  return `oneoff:${item.itemNameSnapshot.trim().toLowerCase()}`;
}

function headerKey(sale: Sale, dim: SaleDimension, grain: TimeGrain): string {
  switch (dim) {
    case "recorded_by":
      return sale.recordedByUserId ?? NO_KEY;
    case "customer":
      return sale.customerId ?? NO_KEY;
    case "branch":
      return sale.branchId ?? NO_KEY;
    default:
      return bucketOf(sale.soldAt, grain);
  }
}

// A sale answers a line question through every line it holds; no lines → none.
export function saleKeyOf(grain: TimeGrain): KeyOf<Sale, SaleDimension> {
  return (sale, dim) => {
    if (dim === "item" || dim === "line_type") {
      const keys = sale.items.map((item) => (dim === "item" ? saleItemKey(item) : item.lineType));
      return keys.length > 0 ? [...new Set(keys)] : NO_KEY;
    }
    return headerKey(sale, dim, grain);
  };
}

export function lineKeyOf(grain: TimeGrain): KeyOf<SaleLineRow, SaleDimension> {
  return (line, dim) => {
    if (dim === "item") return saleItemKey(line.item);
    if (dim === "line_type") return line.item.lineType;
    return headerKey(line.sale, dim, grain);
  };
}

export const saleUsd = (sale: Sale) => sale.totalAmount / sale.ratePerUsdSnapshot;

export const lineUsd = (line: SaleLineRow) => line.item.lineTotal / line.sale.ratePerUsdSnapshot;

export function unitsOf(lines: readonly SaleLineRow[]): number {
  return savedProductLines(lines.map((line) => line.item)).reduce(
    (sum, item) => sum + item.quantity,
    0,
  );
}

// Line prices only suggest the total, so these never add up to "Sold" — gotcha #142.
export function saleLineRecords(lines: readonly SaleLineRow[]): RecordRow[] {
  return lines.map(({ id, sale, item }) => ({
    id,
    title: item.itemNameSnapshot,
    subtitle: sale.customer?.name
      ? `#${receiptId(sale.id)} · ${sale.customer.name}`
      : `#${receiptId(sale.id)}`,
    date: sale.soldAt,
    amount: item.lineTotal,
    currencyId: sale.currencyId,
    ratePerUsdSnapshot: sale.ratePerUsdSnapshot,
    customerId: sale.customerId,
  }));
}

export function linesOf(sales: readonly Sale[]): SaleLineRow[] {
  return sales.flatMap((sale) => sale.items.map((item) => ({ id: item.id, sale, item })));
}

const sumOf = <R>(rows: readonly R[], usd: (row: R) => number) =>
  rows.reduce((sum, row) => sum + usd(row), 0);

// Cash only knows customer, branch and day; any other filter has no honest cash figure.
function collectedOnSales(
  cash: readonly CashRow[] | null,
  filter: DimensionFilter,
  grain: TimeGrain,
): number | null {
  if (!cash) return null;
  if (filter.item || filter.line_type || filter.recorded_by) return null;
  const rows = cash.filter(
    (row) =>
      row.stream === "sale" &&
      (filter.customer === undefined || (row.customerId ?? NO_KEY) === filter.customer) &&
      (filter.branch === undefined || (row.branchId ?? NO_KEY) === filter.branch) &&
      (filter.time === undefined || bucketOf(row.date, grain) === filter.time),
  );
  return sumOf(rows, snapshotUsd);
}

export function salesAnalysis(
  report: SalesReport,
  cash: readonly CashRow[] | null,
  state: SectionViewState,
  period: ReportPeriod,
): SalesAnalysis {
  const grain = state.grain ?? defaultGrain(period);
  const groupBy = state.groupBy as SaleDimension;
  const saleKey = saleKeyOf(grain);
  const lineKey = lineKeyOf(grain);
  const sales = applyFilter(report.sales, state.filter, saleKey);
  const lines = applyFilter(linesOf(sales), state.filter, lineKey);
  const prev = applyFilter(report.prevSales, withoutTime(state.filter), saleKey);
  const comparable = state.filter.time === undefined;
  const soldUsd = sumOf(sales, saleUsd);
  const prevSoldUsd = sumOf(prev, saleUsd);
  const collectedUsd = collectedOnSales(cash, state.filter, grain);
  const kpis: ReportKpi[] = [
    {
      key: "sales",
      labelKey: "reports.sales_count",
      value: count(sales.length),
      tone: "indigo",
      delta: comparable ? delta(sales.length, prev.length) : undefined,
    },
    {
      key: "sold",
      labelKey: "reports.sold_value",
      value: money(soldUsd),
      hintKey: "reports.sold_value_hint",
      tone: "emerald",
      delta: comparable ? delta(soldUsd, prevSoldUsd) : undefined,
    },
    {
      key: "average",
      labelKey: "reports.average_sale",
      value: money(ratioOf(soldUsd, sales.length) ?? 0),
      tone: "gray",
    },
    { key: "units", labelKey: "reports.units_sold", value: count(unitsOf(lines)), tone: "gray" },
  ];
  if (collectedUsd !== null) {
    kpis.push({
      key: "collected",
      labelKey: "reports.collected_on_sales",
      value: money(collectedUsd),
      hintKey: "reports.collected_on_sales_hint",
      tone: "emerald",
    });
  }
  const order = groupBy === "time" ? periodBuckets(period, grain) : undefined;
  const grouped: SalesGroups = LINE_DIMENSIONS.includes(groupBy)
    ? { level: "line", groups: groupRows(lines, groupBy, lineKey, lineUsd, order) }
    : { level: "sale", groups: groupRows(sales, groupBy, saleKey, saleUsd, order) };
  return {
    kpis,
    grouped,
    sales,
    lines,
    options: Object.fromEntries(
      SALE_FILTERS.map((dim) => [dim, filterOptions(report.sales, state.filter, dim, saleKey)]),
    ),
    names: namesFrom(report.sales, (sale) => [
      [sale.customerId, sale.customer?.name],
      ...sale.items.map((item): [string, string] => [saleItemKey(item), item.itemNameSnapshot]),
    ]),
    grain,
  };
}
