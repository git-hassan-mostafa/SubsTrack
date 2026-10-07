import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import type { GridColDef } from "@mui/x-data-grid";
import type { Customer } from "@shared/core/types";
import { formatDate } from "@shared/core/utils/date";
import { useReportView } from "@shared/modules/reports/hooks/useReportView";
import { useReportsStore } from "@shared/modules/reports/state/reportsStore";
import {
  CUSTOMER_DIMENSIONS,
  CUSTOMER_FILTERS,
  customersAnalysis,
  expectedMonthlyUsd,
  type CustomerTrendRow,
} from "@shared/modules/reports/utils/customersView";
import type { ReportGroup } from "@shared/modules/reports/utils/analysis";
import { formatKpiValue, money } from "@shared/modules/reports/utils/reportKpis";
import type { CustomersReport } from "@shared/modules/reports/utils/types";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useDisplayCurrency } from "@shared/state/hooks/useDisplayCurrency";
import { chipColors } from "@/shared/components/chipTones";
import { PanelSection } from "@/shared/components/PanelSection";
import { StatusChip } from "@/shared/components/StatusChip";
import { LocalTable } from "@/shared/table/LocalTable";
import { RowLink } from "@/shared/table/RowLink";
import { GroupByControls } from "../../components/AnalysisControls";
import { AnalysisLayout } from "../../components/AnalysisLayout";
import type { GroupRow } from "../../components/BreakdownTable";
import { TrendTable, type TrendSeries } from "../../components/TrendTable";
import { useSectionTools } from "../../hooks/useSectionTools";

interface CustomerDrill {
  title: string;
  customers: Customer[];
}

export function CustomersSection({ report }: { report: CustomersReport }) {
  const { t } = useTranslation();
  const display = useDisplayCurrency();
  const currencies = useCurrencySlice((s) => s.items);
  const { view, setGrain } = useReportView("customers");
  const period = useReportsStore((s) => s.period);
  const [drill, setDrill] = useState<CustomerDrill | null>(null);
  const analysis = useMemo(
    () => customersAnalysis(report, view, period, currencies),
    [currencies, period, report, view],
  );
  const { label } = useSectionTools("customers", analysis.grain);
  const fmt = (usd: number) => formatKpiValue(money(usd), display);

  const figureColumns = useMemo<GridColDef<GroupRow<Customer>>[]>(() => {
    const figure = (
      field: "active" | "joined" | "left",
      headerKey: string,
    ): GridColDef<GroupRow<Customer>> => ({
      field,
      headerName: t(headerKey),
      width: 110,
      valueGetter: (_value, row) => analysis.figures.get(row.key)?.[field] ?? 0,
    });
    return [
      figure("active", "reports.status_active"),
      figure("joined", "reports.joined"),
      figure("left", "reports.left"),
      {
        field: "monthlyUsd",
        headerName: t("reports.expected_monthly"),
        width: 170,
        valueGetter: (_value, row) =>
          formatKpiValue(money(analysis.figures.get(row.key)?.monthlyUsd ?? 0), display),
      },
    ];
  }, [analysis.figures, display, t]);

  const series: TrendSeries<CustomerTrendRow>[] = [
    { field: "joined", header: t("reports.joined"), valueOf: (r) => r.joined, format: String, color: chipColors("emerald").fg },
    { field: "left", header: t("reports.left"), valueOf: (r) => r.left, format: String, color: chipColors("red").fg },
    { field: "net", header: t("reports.net_change"), valueOf: (r) => r.net, format: String },
  ];

  const showGroup = (group: ReportGroup<Customer>) =>
    setDrill({ title: label(view.groupBy, group.key), customers: group.rows });

  return (
    <>
      <AnalysisLayout<Customer>
        section="customers"
        kpis={analysis.kpis}
        kpiNote={
          analysis.unpricedLines > 0
            ? t("web.reports.unpriced_lines", { count: analysis.unpricedLines })
            : null
        }
        filters={CUSTOMER_FILTERS}
        dims={CUSTOMER_DIMENSIONS}
        options={analysis.options}
        names={analysis.names}
        grain={analysis.grain}
        groups={analysis.groups}
        measure="count"
        countHeader={t("reports.section_customers")}
        hideValue
        extraColumns={figureColumns}
        onShowGroup={showGroup}
      >
        <PanelSection
          title={t("web.reports.joined_and_left")}
          actions={<GroupByControls dims={[]} view={view} onGrain={setGrain} showGrain />}
        >
          <TrendTable
            label={t("web.reports.joined_and_left")}
            rows={analysis.trend}
            bucketLabel={(key) => label("time", key)}
            bucketHeader={t("reports.dim_time")}
            series={series}
          />
        </PanelSection>
      </AnalysisLayout>
      {drill ? (
        <CustomersDialog drill={drill} format={fmt} currencies={currencies} onClose={() => setDrill(null)} />
      ) : null}
    </>
  );
}

interface CustomersDialogProps {
  drill: CustomerDrill;
  format: (usd: number) => string;
  currencies: Parameters<typeof expectedMonthlyUsd>[1];
  onClose: () => void;
}

function CustomersDialog({ drill, format, currencies, onClose }: CustomersDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const columns = useMemo<GridColDef<Customer>[]>(
    () => [
      {
        field: "name",
        headerName: t("reports.col_name"),
        flex: 1,
        minWidth: 200,
        renderCell: (params) => (
          <RowLink label={params.row.name} tabIndex={params.tabIndex} href={`/customers/${params.row.id}`} />
        ),
      },
      {
        field: "phoneNumber",
        headerName: t("web.users.phone"),
        width: 150,
        valueGetter: (_value, row) => row.phoneNumber ?? "",
      },
      {
        field: "area",
        headerName: t("reports.dim_area"),
        width: 140,
        valueGetter: (_value, row) => row.area ?? "",
      },
      {
        field: "active",
        headerName: t("reports.dim_status"),
        width: 130,
        renderCell: (params) => (
          <StatusChip
            tone={params.row.active ? "emerald" : "gray"}
            label={t(params.row.active ? "reports.status_active" : "reports.status_cancelled")}
          />
        ),
      },
      {
        field: "createdAt",
        headerName: t("web.reports.joined_on"),
        width: 120,
        valueGetter: (_value, row) => formatDate(row.createdAt),
      },
      {
        field: "monthly",
        headerName: t("reports.expected_monthly"),
        width: 160,
        valueGetter: (_value, row) => format(expectedMonthlyUsd(row, currencies)),
      },
    ],
    [currencies, format, t],
  );
  return (
    <Dialog open onClose={onClose} maxWidth="lg" fullWidth aria-labelledby={titleId}>
      <DialogTitle id={titleId} sx={{ fontWeight: 700 }}>
        {drill.title}
      </DialogTitle>
      <DialogContent dividers>
        <LocalTable<Customer> label={drill.title} columns={columns} rows={drill.customers} />
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>{t("common.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}
