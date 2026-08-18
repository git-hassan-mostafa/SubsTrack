import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import type { Currency, DebtCategory } from "@/src/core/types";
import { formatMoney } from "@/src/core/utils/currency";
import { delta, shareOfTotal } from "../../utils/aggregate";
import type { DebtsReport as DebtsReportData, RecordRow } from "../../utils/types";
import { ReportCard } from "../../components/ReportCard";
import { KpiRow, type Kpi } from "../../components/KpiRow";
import { BreakdownList } from "../../components/BreakdownList";
import { RankedList } from "../../components/RankedList";
import { RecordsSheet } from "../../components/RecordsSheet";
import { REPORT_COLORS } from "../../utils/reportColors";
import { COLORS } from "@/src/shared/constants";

interface Props {
  data: DebtsReportData;
  currencies: Currency[];
  displayCurrency: Currency | null;
}

const CATEGORY_COLORS: Record<string, string> = {
  months: REPORT_COLORS.subscription,
  sales: REPORT_COLORS.sale,
  custom: REPORT_COLORS.debt,
  services: COLORS.gray400,
};

export function DebtsReport({ data, currencies, displayCurrency }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const [drillOpen, setDrillOpen] = useState(false);

  const money = (usd: number) => formatMoney(usd, null, displayCurrency);

  const kpis: Kpi[] = [
    {
      key: "outstanding",
      label: t("reports.outstanding"),
      value: money(data.outstandingUsd),
      // The one figure here that is NOT period-scoped — said out loud, because
      // silently mixing it with the period figures is what reads as a bug.
      sub: t("reports.outstanding_hint"),
      tone: data.outstandingUsd > 0 ? "danger" : "success",
    },
    {
      key: "collected",
      label: t("reports.debt_collected"),
      value: money(data.collectedUsd),
      sub: t("reports.debt_collected_hint"),
      tone: "success",
      delta: delta(data.collectedUsd, data.prevCollectedUsd),
    },
    {
      key: "debtors",
      label: t("reports.customers_in_debt"),
      value: data.debtorCount,
    },
    {
      key: "overdue",
      label: t("reports.overdue_customers"),
      value: data.aging.length,
      // Counted to TODAY, never to the end of the period — say so, or this
      // reads as a period figure sitting next to the period figures (#91c).
      sub: t("reports.overdue_hint"),
      tone: data.aging.length > 0 ? "warning" : "success",
    },
  ];

  const categoryRows = shareOfTotal(data.categoryEntries).map((e) => ({
    key: e.key,
    label:
      e.key === "__other__"
        ? t("reports.other")
        : t(`debts.category_${e.key as DebtCategory}`),
    amount: money(e.usd),
    share: e.share,
    color: CATEGORY_COLORS[e.key] ?? COLORS.gray400,
  }));

  const collectedRows = useMemo(
    (): RecordRow[] =>
      data.collected.map((r) => ({
        id: r.id,
        title: r.customerName ?? t("reports.stream_debt"),
        subtitle: r.label,
        date: r.date,
        amount: r.amount,
        currencyId: r.currencyId,
        ratePerUsdSnapshot: r.ratePerUsdSnapshot,
      })),
    [data.collected, t],
  );

  return (
    <>
      <KpiRow items={kpis} />

      <ReportCard
        title={t("reports.top_debtors")}
        actionIcon="open-outline"
        actionLabel={t("reports.debt_collected")}
        onAction={() => setDrillOpen(true)}
      >
        <RankedList
          rows={data.topDebtors.map((d) => ({
            key: d.customerId,
            label: d.customerName,
            // The ageing list is the authority on "how far behind"; a debtor
            // with money owed but no unpaid month simply has no sub-line.
            sub: agingSub(data, d.customerId, t),
            amount: money(d.netUsd),
            tone: "danger" as const,
          }))}
          emptyLabel={t("reports.no_debtors")}
          onPressRow={(customerId) => router.push(`/customers/${customerId}`)}
        />
      </ReportCard>

      <ReportCard title={t("reports.debt_by_category")}>
        <BreakdownList rows={categoryRows} emptyLabel={t("reports.no_debtors")} />
      </ReportCard>

      <RecordsSheet
        visible={drillOpen}
        onDismiss={() => setDrillOpen(false)}
        title={t("reports.debt_collected")}
        totalLabel={money(data.collectedUsd)}
        rows={collectedRows}
        currencies={currencies}
        displayCurrency={displayCurrency}
      />
    </>
  );
}

function agingSub(
  data: DebtsReportData,
  customerId: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string | undefined {
  const row = data.aging.find((a) => a.customerId === customerId);
  return row ? t("reports.months_behind", { count: row.months }) : undefined;
}
