import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Customer, MonthEntry } from "@shared/core/types";
import { findCurrency, formatMoney } from "@shared/core/utils/currency";
import { getCurrentYearMonth } from "@shared/core/utils/date";
import {
  lineIndicator,
  minGridYear,
  yearSummary,
} from "@shared/modules/customer/customer-payments/utils/gridSummary";
import type { LineGates } from "@shared/modules/customer/customer-payments/utils/monthActions";
import { lastBillableMonth } from "@shared/modules/customer/customer-payments/utils/payWindow";
import { resolveLinePrice } from "@shared/modules/customer/customer-plans/utils/linePrice";
import { useOwedChanged } from "@shared/modules/ledger/hooks/useOwedChanged";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { usePaymentSlice } from "@shared/state/hooks/usePaymentSlice";
import { useDisplayCurrencyId } from "@shared/state/hooks/useTenantSettingSlice";

const EMPTY_GRID: MonthEntry[] = [];
const EMPTY_MONTHS: string[] = [];
const NO_PRICE = { customPrice: null, customCurrencyId: null, plan: null };

// One read of every bill, then the year arrows re-derive from memory (#121).
export function useLineGrid(customer: Customer, refreshToken = 0) {
  const { t } = useTranslation();
  const bills = usePaymentSlice((s) => s.bills);
  const skips = usePaymentSlice((s) => s.skips);
  const monthGridsByLine = usePaymentSlice((s) => s.monthGridsByLine);
  const uncoveredMonthsByLine = usePaymentSlice((s) => s.uncoveredMonthsByLine);
  const paidMonthsByLine = usePaymentSlice((s) => s.paidMonthsByLine);
  const loading = usePaymentSlice((s) => s.loading);
  const billsCustomerId = usePaymentSlice((s) => s.billsCustomerId);
  const error = usePaymentSlice((s) => s.error);
  const fetchBills = usePaymentSlice((s) => s.fetchBills);
  const buildGrids = usePaymentSlice((s) => s.buildGrids);
  const resetPayments = usePaymentSlice((s) => s.reset);
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrency = findCurrency(currencies, useDisplayCurrencyId());

  const lines = useMemo(
    () => customer.customerPlans ?? [],
    [customer.customerPlans],
  );
  const linesKey = lines
    .map((l) => `${l.id}:${l.active}:${l.startDate}:${l.planId}`)
    .join(",");
  const billsReady = billsCustomerId === customer.id;

  const [year, setYear] = useState(getCurrentYearMonth().year);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);

  useEffect(() => {
    if (lines.length === 0) {
      setSelectedLineId(null);
      return;
    }
    if (!selectedLineId || !lines.some((l) => l.id === selectedLineId)) {
      setSelectedLineId((lines.find((l) => l.active) ?? lines[0]).id);
    }
  }, [linesKey, lines, selectedLineId]);

  useEffect(() => {
    if (lines.length > 0) void fetchBills(customer.id);
  }, [customer.id, lines.length, fetchBills, refreshToken]);

  const reloadBills = useCallback(() => {
    if (lines.length > 0) void fetchBills(customer.id);
  }, [customer.id, lines.length, fetchBills]);
  useOwedChanged(reloadBills);

  useEffect(() => {
    if (lines.length > 0 && billsReady) buildGrids(lines, year);
  }, [year, linesKey, lines, bills, skips, billsReady, buildGrids]);

  useEffect(() => {
    return () => resetPayments();
  }, [resetPayments]);

  const selectedLine = lines.find((l) => l.id === selectedLineId) ?? null;
  const linePrice = resolveLinePrice(selectedLine ?? NO_PRICE);
  const grid = selectedLine
    ? (monthGridsByLine[selectedLine.id] ?? EMPTY_GRID)
    : EMPTY_GRID;
  const uncoveredMonths = selectedLine
    ? (uncoveredMonthsByLine[selectedLine.id] ?? EMPTY_MONTHS)
    : EMPTY_MONTHS;
  const paidMonths = selectedLine
    ? (paidMonthsByLine[selectedLine.id] ?? EMPTY_MONTHS)
    : EMPTY_MONTHS;

  const gates = useMemo<LineGates>(
    () => ({
      payLimit: lastBillableMonth(customer, selectedLine),
      uncoveredMonths,
      paidMonths,
    }),
    [customer, selectedLine, uncoveredMonths, paidMonths],
  );

  const minYear = minGridYear(lines, selectedLine);
  const stepYear = useCallback(
    (delta: number) =>
      setYear((y) => (delta < 0 && y <= minYear ? y : y + delta)),
    [minYear],
  );

  const priceLabel = (() => {
    if (!selectedLine) return null;
    if (!linePrice.isFixed) return t("common.custom");
    const amount = formatMoney(
      linePrice.amount!,
      findCurrency(currencies, linePrice.currencyId),
      displayCurrency,
    );
    const withPeriod =
      linePrice.durationMonths > 1
        ? `${amount} / ${t("plans.n_months", { count: linePrice.durationMonths })}`
        : `${amount} ${t("plans.per_month_suffix")}`;
    return linePrice.kind === "special"
      ? `${withPeriod} · ${t("subscriptions.special_badge")}`
      : withPeriod;
  })();

  const summary = yearSummary(grid, bills, selectedLine?.id ?? null, year);

  return {
    lines,
    selectedLine,
    selectLine: setSelectedLineId,
    indicatorOf: (lineId: string) =>
      lineIndicator(monthGridsByLine[lineId] ?? EMPTY_GRID),
    year,
    minYear,
    stepYear,
    grid,
    gridPending: !error && (!billsReady || grid.length === 0),
    loading,
    billsReady,
    gates,
    linePrice,
    priceLabel,
    summary,
    collectedLabel: formatMoney(summary.collectedUsd, null, displayCurrency),
    reloadBills,
  };
}
