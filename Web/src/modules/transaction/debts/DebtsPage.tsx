import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import NoteAddOutlined from "@mui/icons-material/NoteAddOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import type { DebtSummary } from "@shared/core/types";
import { findCurrency, formatMoney } from "@shared/core/utils/currency";
import { useOwedChanged } from "@shared/modules/ledger/hooks/useOwedChanged";
import { useEffectiveBranchFilter } from "@shared/shared/hooks/useEffectiveBranchFilter";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useLedgerSlice } from "@shared/state/hooks/useLedgerSlice";
import { useDisplayCurrencyId } from "@shared/state/hooks/useTenantSettingSlice";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { AllDebtsTab } from "./AllDebtsTab";
import { DebtHistoryTab } from "./DebtHistoryTab";
import { DebtorsTab } from "./DebtorsTab";
import { useDebtDoors } from "./useDebtDoors";

const DEBT_TABS = ["debtors", "all", "history"] as const;
type DebtTab = (typeof DEBT_TABS)[number];

function tabOf(raw: string | null): DebtTab {
  return DEBT_TABS.find((tab) => tab === raw) ?? "debtors";
}

// The whole open-bills view is ONE read, re-read on open and on every money write.
export function DebtsPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = tabOf(searchParams.get("tab"));
  const branch = useEffectiveBranchFilter();
  const view = useLedgerSlice((s) => s.debts);
  const loading = useLedgerSlice((s) => s.loading);
  const error = useLedgerSlice((s) => s.error);
  const fetchDebts = useLedgerSlice((s) => s.fetchDebts);
  const clearError = useLedgerSlice((s) => s.clearError);
  const doors = useDebtDoors();

  const refresh = useCallback(() => void fetchDebts(branch), [fetchDebts, branch]);
  useEffect(refresh, [refresh]);
  useOwedChanged(refresh);

  const selectTab = (next: DebtTab) =>
    setSearchParams(next === "debtors" ? {} : { tab: next }, { replace: true });

  return (
    <Stack spacing={2}>
      <ErrorBanner message={error} onDismiss={clearError} />
      {doors.banners}
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ alignItems: { md: "stretch" } }}>
        <DebtsSummary summary={view?.summary ?? null} />
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "flex-end" }}>
          <Tooltip title={t("web.table.refresh")}>
            <span>
              <IconButton aria-label={t("web.table.refresh")} disabled={loading} onClick={refresh}>
                <RefreshIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Button variant="contained" startIcon={<NoteAddOutlined />} onClick={() => doors.addCustomDebt()}>
            {t("debts.add_custom_debt")}
          </Button>
        </Stack>
      </Stack>
      <Paper variant="outlined">
        <Tabs value={tab} onChange={(_event, next: DebtTab) => selectTab(next)} aria-label={t("web.debts.tabs")}>
          <Tab value="debtors" label={t("web.debts.debtors_tab")} />
          <Tab value="all" label={t("debts.all_debts_title")} />
          <Tab value="history" label={t("debts.history_title")} />
        </Tabs>
        {loading && tab !== "history" ? <LinearProgress aria-label={t("web.loading")} /> : null}
      </Paper>
      {tab === "debtors" ? (
        <DebtorsTab debtors={view?.customers ?? []} loaded={view !== null} doors={doors} />
      ) : null}
      {tab === "all" ? <AllDebtsTab view={view} branch={branch} doors={doors} /> : null}
      {tab === "history" ? <DebtHistoryTab branch={branch} doors={doors} /> : null}
      {doors.dialogs}
    </Stack>
  );
}

// Every figure is a bill still owed; the three parts add up to the total exactly.
function DebtsSummary({ summary }: { summary: DebtSummary | null }) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const display = findCurrency(currencies, useDisplayCurrencyId());
  const money = (usd: number) => formatMoney(usd, null, display);
  const parts = [
    { key: "months", label: t("ledger.kind_month"), usd: summary?.monthsUsd ?? 0 },
    { key: "sales", label: t("ledger.kind_sale"), usd: summary?.salesUsd ?? 0 },
    { key: "manual", label: t("ledger.kind_manual"), usd: summary?.manualUsd ?? 0 },
  ];
  return (
    <Paper variant="outlined" sx={{ px: 2.5, py: 2, flexGrow: 1 }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 1.5, sm: 4 }} sx={{ alignItems: { sm: "center" } }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {t("debts.total_outstanding")}
          </Typography>
          <Typography variant="h5" component="p" sx={{ fontWeight: 700, color: "error.main" }}>
            {money(summary?.totalUsd ?? 0)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t("ledger.owed_by_n_customers", { count: summary?.customerCount ?? 0 })}
          </Typography>
        </Box>
        {parts.map((part) => (
          <Box key={part.key}>
            <Typography variant="body2" color="text.secondary">
              {part.label}
            </Typography>
            <Typography sx={{ fontWeight: 600 }}>{money(part.usd)}</Typography>
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}
