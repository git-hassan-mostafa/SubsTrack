import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import { formatKpiValue, type ReportKpi } from "@shared/modules/reports/utils/reportKpis";
import { useDisplayCurrency } from "@shared/state/hooks/useDisplayCurrency";
import { StatCard } from "@/shared/components/StatCard";

export function KpiGrid({ kpis }: { kpis: ReportKpi[] }) {
  const { t } = useTranslation();
  const display = useDisplayCurrency();
  return (
    <Box
      sx={{
        display: "grid",
        gap: 2,
        gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(auto-fit, minmax(200px, 1fr))" },
      }}
    >
      {kpis.map((kpi) => (
        <StatCard
          key={kpi.key}
          label={t(kpi.labelKey)}
          value={formatKpiValue(kpi.value, display)}
          tone={kpi.tone}
          hint={kpi.hintKey ? t(kpi.hintKey) : null}
          delta={kpi.delta}
          higherIsBetter={kpi.higherIsBetter}
        />
      ))}
    </Box>
  );
}
