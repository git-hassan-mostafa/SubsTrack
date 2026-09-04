import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CashStream, Currency, ExpenseCategory } from "@/src/core/types";
import { formatMoney } from "@/src/core/utils/currency";
import { expenseCategoryLabelKey } from "@/src/modules/transaction/expenses/utils/expenseCategories";
import { delta, shareOfTotal } from "../../utils/aggregate";
import { REPORT_COLORS } from "../../utils/reportColors";
import type { MoneyReport as MoneyReportData, RecordRow } from "../../utils/types";
import { ReportCard } from "../../components/ReportCard";
import { KpiRow, type Kpi } from "../../components/KpiRow";
import { BreakdownList } from "../../components/BreakdownList";
import { CurrencySplit } from "../../components/CurrencySplit";
import { RecordsSheet } from "../../components/RecordsSheet";

interface Props {
  data: MoneyReportData;
  currencies: Currency[];
  displayCurrency: Currency | null;
}

// What the user tapped, so the sheet knows which rows to show.
type Drill =
  | { kind: "stream"; stream: CashStream }
  | { kind: "category"; category: string };

const usdOf = (r: { amount: number; ratePerUsdSnapshot: number }) =>
  r.amount / r.ratePerUsdSnapshot;

export function MoneyReport({ data, currencies, displayCurrency }: Props) {
  const { t } = useTranslation();
  const [drill, setDrill] = useState<Drill | null>(null);

  const money = (usd: number) => formatMoney(usd, null, displayCurrency);

  const kpis: Kpi[] = [
    {
      key: "collected",
      label: t("reports.collected"),
      value: money(data.collectedUsd),
      tone: "success",
      delta: delta(data.collectedUsd, data.prevCollectedUsd),
    },
    {
      key: "spent",
      label: t("reports.spent"),
      value: money(data.spentUsd),
      tone: "warning",
      delta: delta(data.spentUsd, data.prevSpentUsd),
      higherIsBetter: false,
    },
    {
      key: "net",
      label: t("reports.net"),
      value: money(data.netUsd),
      tone: data.netUsd < 0 ? "danger" : "primary",
      delta: delta(data.netUsd, data.prevNetUsd),
    },
    {
      key: "margin",
      label: t("reports.margin"),
      value:
        data.collectedUsd === 0
          ? "—"
          : `${Math.round((data.netUsd / data.collectedUsd) * 100)}%`,
    },
  ];

  const streamRows = shareOfTotal(data.streamEntries).map((e) => ({
    key: e.key,
    label: t(`reports.stream_${e.key}`),
    amount: money(e.usd),
    share: e.share,
    color: REPORT_COLORS[e.key as CashStream],
  }));

  const categoryRows = shareOfTotal(data.categoryEntries).map((e) => ({
    key: e.key,
    label: t(expenseCategoryLabelKey(e.key as ExpenseCategory)),
    amount: money(e.usd),
    share: e.share,
    color: REPORT_COLORS.expense,
  }));

  const drilled = useMemo((): { title: string; rows: RecordRow[]; totalUsd: number } | null => {
    if (!drill) return null;

    if (drill.kind === "category") {
      const rows = data.expenses.filter((e) => e.category === drill.category);
      return {
        title: t(expenseCategoryLabelKey(drill.category as ExpenseCategory)),
        totalUsd: rows.reduce((s, r) => s + usdOf(r), 0),
        rows: rows.map((e) => ({
          id: e.id,
          title: e.label,
          subtitle: null,
          date: e.date,
          amount: e.amount,
          currencyId: e.currencyId,
          ratePerUsdSnapshot: e.ratePerUsdSnapshot,
        })),
      };
    }

    const cash = data.cash.filter((r) => r.stream === drill.stream);

    return {
      title: t(`reports.stream_${drill.stream}`),
      totalUsd: cash.reduce((s, r) => s + usdOf(r), 0),
      rows: cash.map((r) => ({
        id: `${r.stream}:${r.id}`,
        title: r.customerName ?? r.label ?? t(`reports.stream_${r.stream}`),
        subtitle: r.customerName ? r.label : null,
        date: r.date,
        amount: r.amount,
        currencyId: r.currencyId,
        ratePerUsdSnapshot: r.ratePerUsdSnapshot,
      })),
    };
  }, [drill, data, t]);

  return (
    <>
      <KpiRow items={kpis} />

      <ReportCard title={t("reports.money_in")}>
        <BreakdownList
          rows={streamRows}
          emptyLabel={t("reports.no_cash")}
          onPressRow={(key) => setDrill({ kind: "stream", stream: key as CashStream })}
        />
      </ReportCard>

      <ReportCard title={t("reports.money_out")}>
        <BreakdownList
          rows={categoryRows}
          emptyLabel={t("expenses.no_expenses")}
          onPressRow={(category) => setDrill({ kind: "category", category })}
        />
      </ReportCard>

      <ReportCard title={t("reports.by_currency")} subtitle={t("reports.by_currency_hint")}>
        <CurrencySplit
          rows={data.byCurrency}
          currencies={currencies}
          displayCurrency={displayCurrency}
        />
      </ReportCard>

      <RecordsSheet
        visible={!!drilled}
        onDismiss={() => setDrill(null)}
        title={drilled?.title ?? ""}
        totalLabel={money(drilled?.totalUsd ?? 0)}
        rows={drilled?.rows ?? []}
        currencies={currencies}
        displayCurrency={displayCurrency}
      />
    </>
  );
}
