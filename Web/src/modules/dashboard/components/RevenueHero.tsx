import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ArrowDownward from "@mui/icons-material/ArrowDownward";
import ArrowUpward from "@mui/icons-material/ArrowUpward";
import { MONTHS } from "@shared/core/constants";
import type { DashboardMetrics } from "@shared/core/types";
import { currentDate } from "@shared/core/utils/date";
import { revenueHero } from "@shared/modules/dashboard/utils/dashboardView";
import { formatKpiValue, money } from "@shared/modules/reports/utils/reportKpis";
import { useDisplayCurrency } from "@shared/state/hooks/useDisplayCurrency";

interface RevenueHeroProps {
  metrics: DashboardMetrics;
  isAdmin: boolean;
}

const ON_PRIMARY_MUTED = "rgba(255,255,255,0.75)";

const PANEL = { bgcolor: "rgba(255,255,255,0.12)", borderRadius: 2, px: 2, py: 1.5 } as const;

// Cash collected this month and what stands beside it; what shows comes from revenueHero.
export function RevenueHero({ metrics, isAdmin }: RevenueHeroProps) {
  const { t } = useTranslation();
  const display = useDisplayCurrency();
  const hero = revenueHero(metrics, isAdmin);
  const fmt = (usd: number) => formatKpiValue(money(usd), display);
  const today = currentDate();
  const up = (hero.changePct ?? 0) >= 0;
  const Arrow = up ? ArrowUpward : ArrowDownward;

  return (
    <Paper sx={{ bgcolor: "primary.main", color: "common.white", p: 3, height: "100%" }} elevation={0}>
      <Stack spacing={2.5}>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="overline" sx={{ color: ON_PRIMARY_MUTED, fontWeight: 700 }}>
            {t("dashboard.monthly_collected", {
              month: t(`months.${MONTHS[today.getMonth()]}`),
              year: today.getFullYear(),
            })}
          </Typography>
          <Button href="/reports" variant="outlined" size="small" color="inherit">
            {t("web.dashboard.open_reports")}
          </Button>
        </Stack>
        <Stack direction="row" spacing={2} useFlexGap sx={{ alignItems: "baseline", flexWrap: "wrap" }}>
          <Typography variant="h3" component="p" sx={{ fontWeight: 700 }}>
            {fmt(hero.revenueUsd)}
          </Typography>
          {hero.changePct !== null ? (
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
              <Arrow sx={{ fontSize: 18 }} />
              <Typography sx={{ fontWeight: 700 }}>{Math.abs(hero.changePct)}%</Typography>
              <Typography variant="body2" sx={{ color: ON_PRIMARY_MUTED }}>
                {t("dashboard.vs_last_month")}
              </Typography>
            </Stack>
          ) : null}
        </Stack>
        {hero.mix.length > 0 ? (
          <Stack direction="row" spacing={3} sx={PANEL}>
            {hero.mix.map((part) => (
              <Box key={part.key}>
                <Typography variant="body2" sx={{ color: ON_PRIMARY_MUTED }}>
                  {t(part.labelKey)}
                </Typography>
                <Typography sx={{ fontWeight: 700 }}>{fmt(part.usd)}</Typography>
              </Box>
            ))}
          </Stack>
        ) : null}
        {hero.showExpenses || hero.showToCollect ? (
          <Stack direction="row" spacing={3} sx={PANEL}>
            {hero.showExpenses ? (
              <Box>
                <Typography variant="body2" sx={{ color: ON_PRIMARY_MUTED }}>
                  {t("dashboard.expenses_label")}
                </Typography>
                <Typography sx={{ fontWeight: 700 }}>{fmt(Math.abs(hero.expensesUsd))}</Typography>
              </Box>
            ) : null}
            {hero.showExpenses ? (
              <Box>
                <Typography variant="body2" sx={{ color: ON_PRIMARY_MUTED }}>
                  {t("dashboard.net_income")}
                </Typography>
                <Typography sx={{ fontWeight: 700 }}>{fmt(hero.netUsd)}</Typography>
              </Box>
            ) : null}
            {hero.showToCollect ? (
              <Box>
                <Typography variant="body2" sx={{ color: ON_PRIMARY_MUTED }}>
                  {t("dashboard.total_to_collect")}
                </Typography>
                <Typography sx={{ fontWeight: 700 }}>{fmt(hero.toCollectUsd)}</Typography>
                {hero.toCollectMix.length > 0 ? (
                  <Typography variant="caption" sx={{ display: "block", color: ON_PRIMARY_MUTED }}>
                    {hero.toCollectMix.map((part) => `${t(part.labelKey)} ${fmt(part.usd)}`).join(" · ")}
                  </Typography>
                ) : null}
                {hero.unpricedLines > 0 ? (
                  <Typography variant="caption" sx={{ display: "block", color: ON_PRIMARY_MUTED }}>
                    {t("dashboard.unpriced_not_counted", { count: hero.unpricedLines })}
                  </Typography>
                ) : null}
              </Box>
            ) : null}
          </Stack>
        ) : null}
        <Box>
          <Stack direction="row" sx={{ justifyContent: "space-between", mb: 1 }}>
            <Typography variant="body2" sx={{ color: ON_PRIMARY_MUTED, fontWeight: 600 }}>
              {t("dashboard.collection_progress")}
            </Typography>
            <Typography sx={{ fontWeight: 700 }}>{hero.collectedPct}%</Typography>
          </Stack>
          <Box
            role="progressbar"
            aria-label={t("dashboard.collection_progress")}
            aria-valuenow={hero.collectedPct}
            aria-valuemin={0}
            aria-valuemax={100}
            sx={{ height: 8, borderRadius: 4, bgcolor: "rgba(255,255,255,0.2)", overflow: "hidden" }}
          >
            <Box sx={{ width: `${hero.collectedPct}%`, height: "100%", bgcolor: "common.white" }} />
          </Box>
          <Typography variant="body2" sx={{ color: ON_PRIMARY_MUTED, mt: 1 }}>
            {t("dashboard.paid_of_active", { paid: hero.paid, total: hero.due })}
          </Typography>
        </Box>
      </Stack>
    </Paper>
  );
}
