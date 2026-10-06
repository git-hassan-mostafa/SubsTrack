import type { DashboardMetrics } from "@shared/core/types";
import type { PageKey } from "@shared/modules/authentication/auth/utils/pageAccess";
import { count, money, type KpiValue } from "@shared/modules/reports/utils/reportKpis";
import type { Tone } from "@shared/shared/lib/tone";

export interface RevenueMixPart {
  key: "subscriptions" | "sales" | "manual";
  labelKey: string;
  usd: number;
}

export interface RevenueHero {
  revenueUsd: number;
  changePct: number | null;
  mix: RevenueMixPart[];
  expensesUsd: number;
  showExpenses: boolean;
  owedUsd: number;
  netUsd: number;
  collectedPct: number;
  paid: number;
  due: number;
}

export type DashboardTileKey =
  | "active"
  | "unpaid"
  | "new_customers"
  | "cancelled"
  | "payments"
  | "sales"
  | "expenses"
  | "net"
  | "wallets"
  | "debt";

export interface DashboardTile {
  key: DashboardTileKey;
  labelKey: string;
  value: KpiValue;
  subKey: string;
  subValues?: Record<string, KpiValue>;
  tone: Tone;
  page: PageKey;
  wide: boolean;
}

// Spending and net are admin-only figures, and hidden while there is nothing spent.
function showsExpenses(metrics: DashboardMetrics, isAdmin: boolean): boolean {
  return isAdmin && metrics.monthlyExpenses > 0;
}

// Paid and due count the same population, so the bar can reach 100% — gotcha #87.
export function revenueHero(metrics: DashboardMetrics, isAdmin: boolean): RevenueHero {
  const prev = metrics.prevMonthRevenue;
  const paid = Math.max(0, metrics.dueThisMonth - metrics.unpaidThisMonth);
  const due = metrics.dueThisMonth;
  const parts: RevenueMixPart[] = [
    { key: "subscriptions", labelKey: "dashboard.subscriptions", usd: metrics.subscriptionRevenue },
    { key: "sales", labelKey: "dashboard.sales_label", usd: metrics.salesRevenue },
    { key: "manual", labelKey: "reports.stream_manual", usd: metrics.manualRevenue },
  ];
  const earning = parts.filter((part) => part.usd > 0);
  return {
    revenueUsd: metrics.monthlyRevenue,
    changePct:
      prev > 0 ? Math.round(((metrics.monthlyRevenue - prev) / prev) * 100) : null,
    mix: earning.length > 1 ? earning : [],
    expensesUsd: metrics.monthlyExpenses,
    showExpenses: showsExpenses(metrics, isAdmin),
    owedUsd: metrics.totalDebt,
    netUsd: metrics.netIncome,
    collectedPct: due > 0 ? Math.min(100, Math.round((paid / due) * 100)) : 100,
    paid,
    due,
  };
}

export function dashboardTiles(metrics: DashboardMetrics, isAdmin: boolean): DashboardTile[] {
  const tiles: DashboardTile[] = [
    {
      key: "active",
      labelKey: "dashboard.active",
      value: count(metrics.activeCustomers),
      subKey: "dashboard.of_total",
      subValues: { total: count(metrics.totalCustomers) },
      tone: "gray",
      page: "customers",
      wide: false,
    },
    {
      key: "unpaid",
      labelKey: "dashboard.unpaid",
      value: count(metrics.unpaidThisMonth),
      subKey: "dashboard.customers_this_month",
      tone: "red",
      page: "customers",
      wide: false,
    },
    {
      key: "new_customers",
      labelKey: "dashboard.new_customers",
      value: count(metrics.newCustomersThisMonth),
      subKey: "dashboard.joined",
      tone: "emerald",
      page: "customers",
      wide: false,
    },
    {
      key: "cancelled",
      labelKey: "dashboard.cancelled",
      value: count(metrics.cancelledThisMonth),
      subKey: "dashboard.left",
      tone: "gray",
      page: "customers",
      wide: false,
    },
    {
      key: "payments",
      labelKey: "dashboard.payments_recorded",
      value: count(metrics.paymentsCollectedCount),
      subKey: "dashboard.this_month",
      tone: "indigo",
      page: "money_received",
      wide: false,
    },
    {
      key: "sales",
      labelKey: "dashboard.sales_recorded",
      value: count(metrics.salesCount),
      subKey: "dashboard.this_month",
      tone: "indigo",
      page: "sales",
      wide: false,
    },
  ];
  if (showsExpenses(metrics, isAdmin)) {
    tiles.push(
      {
        key: "expenses",
        labelKey: "dashboard.expenses_label",
        value: money(metrics.monthlyExpenses),
        subKey: "dashboard.expense_breakdown",
        subValues: { stock: money(metrics.stockExpenses), other: money(metrics.customExpenses) },
        tone: "amber",
        page: "expenses",
        wide: true,
      },
      {
        key: "net",
        labelKey: "dashboard.net_income",
        value: money(metrics.netIncome),
        subKey: "dashboard.net_sub",
        subValues: { income: money(metrics.monthlyRevenue), expenses: money(metrics.monthlyExpenses) },
        tone: metrics.netIncome < 0 ? "red" : "emerald",
        page: "reports",
        wide: true,
      },
    );
  }
  if (isAdmin && metrics.walletCash > 0) {
    tiles.push({
      key: "wallets",
      labelKey: "dashboard.cash_in_wallets",
      value: money(metrics.walletCash),
      subKey: "dashboard.wallet_breakdown",
      subValues: {
        collectors: count(metrics.walletCollectors),
        transactions: count(metrics.walletTransactions),
      },
      tone: "indigo",
      page: "wallets",
      wide: true,
    });
  }
  if (metrics.totalDebt > 0) {
    tiles.push({
      key: "debt",
      labelKey: "dashboard.total_debt",
      value: money(metrics.totalDebt),
      subKey: "dashboard.debt_breakdown",
      subValues: { months: money(metrics.monthsDebt), sales: money(metrics.salesDebt) },
      tone: "amber",
      page: "debts",
      wide: true,
    });
  }
  return tiles;
}
