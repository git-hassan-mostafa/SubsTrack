import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { GridColDef } from "@mui/x-data-grid";
import { findCurrency, formatMoney } from "@shared/core/utils/currency";
import { useReportView } from "@shared/modules/reports/hooks/useReportView";
import { useReportsStore } from "@shared/modules/reports/state/reportsStore";
import { overviewAnalysis, type TrendRow } from "@shared/modules/reports/utils/moneyViews";
import { formatKpiValue, money } from "@shared/modules/reports/utils/reportKpis";
import { cashRecords, expenseRecords } from "@shared/modules/reports/utils/reportRecords";
import type { MoneyReport } from "@shared/modules/reports/utils/types";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useDisplayCurrency } from "@shared/state/hooks/useDisplayCurrency";
import { chipColors } from "@/shared/components/chipTones";
import { MoneyText } from "@/shared/components/MoneyText";
import { PanelSection } from "@/shared/components/PanelSection";
import { LocalTable } from "@/shared/table/LocalTable";
import { GroupByControls } from "../../components/AnalysisControls";
import { BreakdownTable } from "../../components/BreakdownTable";
import { KpiGrid } from "../../components/KpiGrid";
import { RecordsDialog, type RecordsDrill } from "../../components/RecordsDialog";
import { TrendTable, type TrendSeries } from "../../components/TrendTable";
import { useSectionTools } from "../../hooks/useSectionTools";

type CurrencyRow = MoneyReport["byCurrency"][number] & { id: string };

export function OverviewSection({ report }: { report: MoneyReport }) {
  const { t } = useTranslation();
  const display = useDisplayCurrency();
  const currencies = useCurrencySlice((s) => s.items);
  const { view, setGrain } = useReportView("money");
  const [drill, setDrill] = useState<RecordsDrill | null>(null);
  const period = useReportsStore((s) => s.period);
  const analysis = useMemo(() => overviewAnalysis(report, view, period), [period, report, view]);
  const { label, fileName } = useSectionTools("money", analysis.grain);
  const fmt = (usd: number) => formatKpiValue(money(usd), display);

  const series: TrendSeries<TrendRow>[] = [
    { field: "inUsd", header: t("web.reports.money_in_short"), valueOf: (r) => r.inUsd, format: fmt, color: chipColors("emerald").fg },
    { field: "outUsd", header: t("web.reports.money_out_short"), valueOf: (r) => r.outUsd, format: fmt, color: chipColors("amber").fg },
    { field: "netUsd", header: t("reports.net"), valueOf: (r) => r.netUsd, format: fmt },
  ];

  const currencyRows = useMemo<CurrencyRow[]>(
    () => report.byCurrency.map((row) => ({ ...row, id: row.currencyId ?? "usd" })),
    [report.byCurrency],
  );
  const currencyColumns: GridColDef<CurrencyRow>[] = [
    {
      field: "currencyId",
      headerName: t("reports.col_currency"),
      flex: 1,
      valueGetter: (_value, row) => findCurrency(currencies, row.currencyId)?.code ?? "USD",
    },
    {
      field: "amount",
      headerName: t("reports.collected"),
      width: 220,
      renderCell: (params) => {
        const currency = findCurrency(currencies, params.row.currencyId);
        return (
          <MoneyText
            primary={formatMoney(params.row.amount, currency, currency)}
            approx={params.row.currencyId ? `≈ ${formatMoney(params.row.usd, null, display)}` : null}
          />
        );
      },
    },
  ];

  return (
    <Stack spacing={3}>
      <KpiGrid kpis={analysis.kpis} />
      <PanelSection
        title={t("web.reports.money_over_time")}
        actions={<GroupByControls dims={[]} view={view} onGrain={setGrain} showGrain />}
      >
        <TrendTable
          label={t("web.reports.money_over_time")}
          rows={analysis.trend}
          bucketLabel={(key) => label("time", key)}
          bucketHeader={t("reports.dim_time")}
          series={series}
        />
      </PanelSection>
      <PanelSection title={t("reports.money_in")}>
        <BreakdownTable
          title={t("reports.money_in")}
          groups={analysis.streams}
          dim="stream"
          label={(key) => label("stream", key)}
          measure="money"
          countHeader={t("web.reports.count_bills_paid")}
          onShowRecords={(group) =>
            setDrill({ title: label("stream", group.key), rows: cashRecords(group.rows) })
          }
        />
      </PanelSection>
      <PanelSection title={t("reports.money_out")}>
        <BreakdownTable
          title={t("reports.money_out")}
          groups={analysis.categories}
          dim="category"
          label={(key) => label("category", key)}
          measure="money"
          countHeader={t("reports.entries")}
          onShowRecords={(group) =>
            setDrill({ title: label("category", group.key), rows: expenseRecords(group.rows) })
          }
        />
      </PanelSection>
      <PanelSection title={t("reports.by_currency")}>
        <Stack spacing={1}>
          <Typography variant="body2" color="text.secondary">
            {t("reports.by_currency_hint")}
          </Typography>
          <LocalTable<CurrencyRow>
            label={t("reports.by_currency")}
            columns={currencyColumns}
            rows={currencyRows}
          />
        </Stack>
      </PanelSection>
      {drill ? (
        <RecordsDialog drill={drill} exportName={fileName(drill.title)} onClose={() => setDrill(null)} />
      ) : null}
    </Stack>
  );
}
