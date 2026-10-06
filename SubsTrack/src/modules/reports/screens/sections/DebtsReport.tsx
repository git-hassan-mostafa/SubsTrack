import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import type { ChargeKind, Currency } from "@shared/core/types";
import { formatMoney } from "@shared/core/utils/currency";
import { shareOfTotal } from "@shared/modules/reports/utils/aggregate";
import { debtsKpis } from "@shared/modules/reports/utils/reportKpis";
import { debtCollectedRecords } from "@shared/modules/reports/utils/reportRecords";
import type { DebtsReport as DebtsReportData } from "@shared/modules/reports/utils/types";
import { ReportCard } from "../../components/ReportCard";
import { KpiRow, toKpis } from "../../components/KpiRow";
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
  month: REPORT_COLORS.month,
  sale: REPORT_COLORS.sale,
  manual: REPORT_COLORS.manual,
};

export function DebtsReport({ data, currencies, displayCurrency }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const [drillOpen, setDrillOpen] = useState(false);

  const money = (usd: number) => formatMoney(usd, null, displayCurrency);

  const kpis = toKpis(debtsKpis(data), t, displayCurrency);

  const categoryRows = shareOfTotal(data.categoryEntries).map((e) => ({
    key: e.key,
    label:
      e.key === "__other__"
        ? t("reports.other")
        : t(`ledger.kind_${e.key as ChargeKind}`),
    amount: money(e.usd),
    share: e.share,
    color: CATEGORY_COLORS[e.key] ?? COLORS.gray400,
  }));

  const collectedRows = useMemo(
    () => debtCollectedRecords(data.collected),
    [data.collected],
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
            sub: agingSub(data, d.customerId, t),
            amount: money(d.debtUsd),
            tone: "danger" as const,
          }))}
          emptyLabel={t("reports.no_debtors")}
          onPressRow={(customerId) => router.push(`/customers/${customerId}`)}
        />
      </ReportCard>

      <ReportCard title={t("reports.debt_by_category")}>
        <BreakdownList
          rows={categoryRows}
          emptyLabel={t("reports.no_debtors")}
        />
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
