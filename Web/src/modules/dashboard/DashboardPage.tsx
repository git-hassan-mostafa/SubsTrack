import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import RefreshIcon from "@mui/icons-material/Refresh";
import type { PageKey } from "@shared/modules/authentication/auth/utils/pageAccess";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { useDashboardStore } from "@shared/modules/dashboard/state/dashboardStore";
import { dashboardTiles } from "@shared/modules/dashboard/utils/dashboardView";
import { useOwedChanged } from "@shared/modules/ledger/hooks/useOwedChanged";
import { formatKpiValue, formatKpiValues } from "@shared/modules/reports/utils/reportKpis";
import { useEffectiveBranchFilter } from "@shared/shared/hooks/useEffectiveBranchFilter";
import { useDisplayCurrency } from "@shared/state/hooks/useDisplayCurrency";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { StatCard } from "@/shared/components/StatCard";
import { RevenueHero } from "./RevenueHero";

const TILE_PATH: Partial<Record<PageKey, string>> = {
  customers: "/customers",
  money_received: "/money-received",
  sales: "/sales",
  expenses: "/expenses",
  reports: "/reports",
  wallets: "/admin/wallets",
  debts: "/debts",
};

// This month at a glance; every tile opens the page that explains its number.
export function DashboardPage() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const branch = useEffectiveBranchFilter();
  const display = useDisplayCurrency();
  const metrics = useDashboardStore((s) => s.metrics);
  const loading = useDashboardStore((s) => s.loading);
  const error = useDashboardStore((s) => s.error);
  const fetchMetrics = useDashboardStore((s) => s.fetchMetrics);
  const ensureMetrics = useDashboardStore((s) => s.ensureMetrics);
  const clearError = useDashboardStore((s) => s.clearError);

  const ensure = useCallback(() => void ensureMetrics(), [ensureMetrics]);
  useEffect(() => {
    ensure();
  }, [branch, ensure]);
  useOwedChanged(ensure);

  if (!metrics) {
    return (
      <Stack spacing={2}>
        <ErrorBanner message={error} onDismiss={clearError} onRetry={() => void fetchMetrics()} />
        {loading ? (
          <Box sx={{ py: 8, display: "flex", justifyContent: "center" }}>
            <CircularProgress aria-label={t("web.loading")} />
          </Box>
        ) : null}
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      <ErrorBanner message={error} onDismiss={clearError} onRetry={() => void fetchMetrics()} />
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
        <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
          {t("dashboard.this_month")}
        </Typography>
        <Tooltip title={t("web.table.refresh")}>
          <span>
            <IconButton aria-label={t("web.table.refresh")} disabled={loading} onClick={() => void fetchMetrics()}>
              <RefreshIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", lg: "minmax(360px, 5fr) 7fr" },
          alignItems: "stretch",
        }}
      >
        <RevenueHero metrics={metrics} isAdmin={isAdmin} />
        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", xl: "repeat(3, 1fr)" },
            alignContent: "start",
          }}
        >
          {dashboardTiles(metrics, isAdmin).map((tile) => (
            <StatCard
              key={tile.key}
              label={t(tile.labelKey)}
              value={formatKpiValue(tile.value, display)}
              hint={t(tile.subKey, formatKpiValues(tile.subValues, display))}
              tone={tile.tone}
              href={TILE_PATH[tile.page]}
            />
          ))}
        </Box>
      </Box>
    </Stack>
  );
}
