import { useCallback, useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Tooltip from "@mui/material/Tooltip";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useOwedChanged } from "@shared/modules/ledger/hooks/useOwedChanged";
import { useReportsStore } from "@shared/modules/reports/state/reportsStore";
import {
  REPORT_SECTIONS,
  SECTION_DATASETS,
  SECTION_LABEL_KEY,
  type ReportSection,
} from "@shared/modules/reports/utils/reportSections";
import { useEffectiveBranchFilter } from "@shared/shared/hooks/useEffectiveBranchFilter";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { CsvButton } from "@/shared/components/CsvButton";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { PeriodPicker } from "@/shared/components/PeriodPicker";
import { sectionCsv } from "../utils/sectionCsv";
import { CustomersSection } from "./sections/CustomersSection";
import { DebtsSection } from "./sections/DebtsSection";
import { MoneyInSection } from "./sections/MoneyInSection";
import { MoneyOutSection } from "./sections/MoneyOutSection";
import { OverviewSection } from "./sections/OverviewSection";
import { SalesSection } from "./sections/SalesSection";
import { StaffSection } from "./sections/StaffSection";

// The period is shared by every section; each section keeps its own filters while you look elsewhere.
export function ReportsPage() {
  const { t } = useTranslation();
  const branch = useEffectiveBranchFilter();
  const section = useReportsStore((s) => s.section);
  const period = useReportsStore((s) => s.period);
  const money = useReportsStore((s) => s.money);
  const debts = useReportsStore((s) => s.debts);
  const customers = useReportsStore((s) => s.customers);
  const sales = useReportsStore((s) => s.sales);
  const loading = useReportsStore((s) => s.loading);
  const error = useReportsStore((s) => s.error);
  const setSection = useReportsStore((s) => s.setSection);
  const setPeriod = useReportsStore((s) => s.setPeriod);
  const ensureSection = useReportsStore((s) => s.ensureSection);
  const fetchSection = useReportsStore((s) => s.fetchSection);
  const clearError = useReportsStore((s) => s.clearError);
  const currencies = useCurrencySlice((s) => s.items);
  const getCurrencies = useCurrencySlice((s) => s.getCurrencies);

  const ensure = useCallback(() => void ensureSection(), [ensureSection]);
  useEffect(() => {
    ensure();
  }, [branch, ensure]);
  useOwedChanged(ensure);
  useEffect(() => {
    void getCurrencies();
  }, [getCurrencies]);

  const held = { money, debts, customers, sales };
  const ready = SECTION_DATASETS[section].every((dataset) => held[dataset] !== null);

  const buildCsv = () => {
    const state = useReportsStore.getState();
    return sectionCsv(section, state, currencies) ?? { headers: [], rows: [] };
  };

  return (
    <Stack spacing={2}>
      <Paper variant="outlined">
        <Tabs
          value={section}
          onChange={(_event, next: ReportSection) => void setSection(next)}
          variant="scrollable"
          scrollButtons="auto"
          aria-label={t("reports.title")}
        >
          {REPORT_SECTIONS.map((key) => (
            <Tab key={key} value={key} label={t(SECTION_LABEL_KEY[key])} />
          ))}
        </Tabs>
      </Paper>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={1.5}
        sx={{ alignItems: { md: "center" }, justifyContent: "space-between" }}
      >
        <PeriodPicker value={period} onChange={(next) => void setPeriod(next)} />
        <Stack direction="row" spacing={1}>
          <Tooltip title={t("web.table.refresh")}>
            <span>
              <IconButton aria-label={t("web.table.refresh")} disabled={loading} onClick={() => void fetchSection()}>
                <RefreshIcon />
              </IconButton>
            </span>
          </Tooltip>
          {ready && section !== "staff" ? (
            <CsvButton
              name={`${t(SECTION_LABEL_KEY[section])}-${period.fromDate}-${period.toDate}`}
              build={buildCsv}
            />
          ) : null}
        </Stack>
      </Stack>
      <ErrorBanner message={error} onDismiss={clearError} onRetry={() => void fetchSection()} />
      {ready ? (
        <Box sx={{ opacity: loading ? 0.6 : 1 }}>{renderSection(section, held)}</Box>
      ) : loading ? (
        <Box sx={{ py: 8, display: "flex", justifyContent: "center" }}>
          <CircularProgress aria-label={t("web.loading")} />
        </Box>
      ) : null}
    </Stack>
  );
}

function renderSection(
  section: ReportSection,
  held: Pick<ReturnType<typeof useReportsStore.getState>, "money" | "debts" | "customers" | "sales">,
): ReactNode {
  const { money, debts, customers, sales } = held;
  switch (section) {
    case "money":
      return money ? <OverviewSection report={money} /> : null;
    case "money_in":
      return money ? <MoneyInSection report={money} /> : null;
    case "money_out":
      return money ? <MoneyOutSection report={money} /> : null;
    case "debts":
      return debts ? <DebtsSection report={debts} /> : null;
    case "customers":
      return customers ? <CustomersSection report={customers} /> : null;
    case "sales":
      return sales ? <SalesSection report={sales} money={money} /> : null;
    case "staff":
      return money && sales ? <StaffSection money={money} sales={sales} /> : null;
  }
}
