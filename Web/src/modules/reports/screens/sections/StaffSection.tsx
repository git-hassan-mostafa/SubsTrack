import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import TrendingDownOutlined from "@mui/icons-material/TrendingDownOutlined";
import type { GridColDef } from "@mui/x-data-grid";
import { cashRecords, expenseRecords, saleRecords } from "@shared/modules/reports/utils/reportRecords";
import { formatKpiValue, money } from "@shared/modules/reports/utils/reportKpis";
import { staffAnalysis, type StaffRow } from "@shared/modules/reports/utils/staffView";
import type { MoneyReport, SalesReport } from "@shared/modules/reports/utils/types";
import type { CsvTable } from "@shared/shared/lib/csv";
import { useDisplayCurrency } from "@shared/state/hooks/useDisplayCurrency";
import { CsvButton } from "@/shared/components/CsvButton";
import { MoneyText } from "@/shared/components/MoneyText";
import { PanelSection } from "@/shared/components/PanelSection";
import { LocalTable } from "@/shared/table/LocalTable";
import { RowLink } from "@/shared/table/RowLink";
import type { TableAction } from "@/shared/table/tableAction";
import { KpiGrid } from "../../components/KpiGrid";
import { RecordsDialog, type RecordsDrill } from "../../components/RecordsDialog";
import { useSectionTools } from "../../hooks/useSectionTools";

type StaffRecords = "cash" | "sales" | "expenses";

function firstKind(row: StaffRow): StaffRecords {
  if (row.cash.length > 0) return "cash";
  return row.sales.length > 0 ? "sales" : "expenses";
}

interface StaffSectionProps {
  money: MoneyReport;
  sales: SalesReport;
}

// One row per person: the cash they took, the sales they rang up, the spending they wrote down.
export function StaffSection({ money: moneyReport, sales }: StaffSectionProps) {
  const { t } = useTranslation();
  const display = useDisplayCurrency();
  const [drill, setDrill] = useState<RecordsDrill | null>(null);
  const analysis = useMemo(() => staffAnalysis(moneyReport, sales), [moneyReport, sales]);
  const { label, fileName } = useSectionTools("staff", "month");
  const fmt = useCallback((usd: number) => formatKpiValue(money(usd), display), [display]);
  const person = useCallback((row: StaffRow) => label("collector", row.id), [label]);

  const open = useCallback(
    (row: StaffRow, kind: StaffRecords) => {
      const rows =
        kind === "cash"
          ? cashRecords(row.cash)
          : kind === "sales"
            ? saleRecords(row.sales)
            : expenseRecords(row.expenses);
      const what = {
        cash: t("web.reports.staff_collected"),
        sales: t("web.reports.staff_sales"),
        expenses: t("web.reports.staff_expenses"),
      }[kind];
      setDrill({ title: person(row), subtitle: what, rows });
    },
    [person, t],
  );

  const rowActions = useCallback(
    (row: StaffRow): TableAction[] =>
      [
        { key: "cash", label: t("web.reports.staff_collected"), icon: PaymentsOutlined, count: row.cash.length },
        { key: "sales", label: t("web.reports.staff_sales"), icon: ReceiptLongOutlined, count: row.sales.length },
        {
          key: "expenses",
          label: t("web.reports.staff_expenses"),
          icon: TrendingDownOutlined,
          count: row.expenses.length,
        },
      ]
        .filter((action) => action.count > 0)
        .map((action) => ({
          key: action.key,
          group: "open" as const,
          label: action.label,
          icon: action.icon,
          onClick: () => open(row, action.key as StaffRecords),
        })),
    [open, t],
  );

  const moneyColumn = (
    field: "collectedUsd" | "soldUsd" | "spentUsd",
    header: string,
  ): GridColDef<StaffRow> => ({
    field,
    headerName: header,
    width: 160,
    renderCell: (params) => <MoneyText primary={fmt(params.row[field])} />,
  });

  const columns: GridColDef<StaffRow>[] = [
    {
      field: "id",
      headerName: t("web.reports.person"),
      flex: 1,
      minWidth: 200,
      renderCell: (params) => (
        <RowLink
          label={person(params.row)}
          tabIndex={params.tabIndex}
          onClick={() => open(params.row, firstKind(params.row))}
        />
      ),
    },
    moneyColumn("collectedUsd", t("web.reports.staff_collected")),
    { field: "handOvers", headerName: t("reports.hand_overs"), width: 140 },
    { field: "salesCount", headerName: t("reports.sales_count"), width: 110 },
    moneyColumn("soldUsd", t("reports.sold_value")),
    moneyColumn("spentUsd", t("web.reports.staff_expenses")),
  ];

  const csv = (): CsvTable => ({
    headers: [
      t("web.reports.person"),
      t("web.reports.staff_collected"),
      t("reports.hand_overs"),
      t("reports.sales_count"),
      t("reports.sold_value"),
      t("web.reports.staff_expenses"),
    ],
    rows: analysis.rows.map((row) => [
      person(row),
      row.collectedUsd.toFixed(2),
      row.handOvers,
      row.salesCount,
      row.soldUsd.toFixed(2),
      row.spentUsd.toFixed(2),
    ]),
  });

  return (
    <Stack spacing={3}>
      <KpiGrid kpis={analysis.kpis} />
      <PanelSection
        title={t("web.reports.staff_title")}
        actions={<CsvButton name={fileName()} build={csv} />}
      >
        <LocalTable<StaffRow>
          label={t("web.reports.staff_title")}
          columns={columns}
          rows={analysis.rows}
          rowLabel={person}
          rowActions={rowActions}
        />
      </PanelSection>
      {drill ? (
        <RecordsDialog drill={drill} exportName={fileName(drill.title)} onClose={() => setDrill(null)} />
      ) : null}
    </Stack>
  );
}
