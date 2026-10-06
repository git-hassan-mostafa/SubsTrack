import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CashStream, Currency, ExpenseCategory } from "@shared/core/types";
import { formatMoney } from "@shared/core/utils/currency";
import { expenseCategoryLabelKey } from "@shared/modules/transaction/expenses/utils/expenseCategories";
import { shareOfTotal } from "@shared/modules/reports/utils/aggregate";
import { moneyKpis } from "@shared/modules/reports/utils/reportKpis";
import {
  cashRecords,
  expenseRecords,
  withTotal,
} from "@shared/modules/reports/utils/reportRecords";
import { REPORT_COLORS } from "../../utils/reportColors";
import type { MoneyReport as MoneyReportData } from "@shared/modules/reports/utils/types";
import { ReportCard } from "../../components/ReportCard";
import { KpiRow, toKpis } from "../../components/KpiRow";
import { BreakdownList } from "../../components/BreakdownList";
import { CurrencySplit } from "../../components/CurrencySplit";
import { RecordsSheet } from "../../components/RecordsSheet";

interface Props {
  data: MoneyReportData;
  currencies: Currency[];
  displayCurrency: Currency | null;
}

type Drill =
  | { kind: "stream"; stream: CashStream }
  | { kind: "category"; category: string };

export function MoneyReport({ data, currencies, displayCurrency }: Props) {
  const { t } = useTranslation();
  const [drill, setDrill] = useState<Drill | null>(null);

  const money = (usd: number) => formatMoney(usd, null, displayCurrency);

  const kpis = toKpis(moneyKpis(data), t, displayCurrency);

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

  const drilled = useMemo(() => {
    if (!drill) return null;
    if (drill.kind === "category") {
      return {
        title: t(expenseCategoryLabelKey(drill.category as ExpenseCategory)),
        ...withTotal(
          expenseRecords(data.expenses.filter((e) => e.category === drill.category)),
        ),
      };
    }
    return {
      title: t(`reports.stream_${drill.stream}`),
      ...withTotal(cashRecords(data.cash.filter((r) => r.stream === drill.stream))),
    };
  }, [drill, data, t]);

  return (
    <>
      <KpiRow items={kpis} />

      <ReportCard title={t("reports.money_in")}>
        <BreakdownList
          rows={streamRows}
          emptyLabel={t("reports.no_cash")}
          onPressRow={(key) =>
            setDrill({ kind: "stream", stream: key as CashStream })
          }
        />
      </ReportCard>

      <ReportCard title={t("reports.money_out")}>
        <BreakdownList
          rows={categoryRows}
          emptyLabel={t("expenses.no_expenses")}
          onPressRow={(category) => setDrill({ kind: "category", category })}
        />
      </ReportCard>

      <ReportCard
        title={t("reports.by_currency")}
        subtitle={t("reports.by_currency_hint")}
      >
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
