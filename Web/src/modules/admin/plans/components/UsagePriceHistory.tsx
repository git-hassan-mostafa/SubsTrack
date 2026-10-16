import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Currency, PlanPriceChange, PlanUsage } from "@shared/core/types";
import { billingMonthLabel } from "@shared/core/utils/billingMonth";
import { usageMonthPriceLabel } from "@shared/modules/admin/plans/utils/planLabels";
import { usageMonthPriceRows } from "@shared/modules/admin/plans/utils/usageMonthPrices";
import { ErrorBanner } from "@/shared/components/ErrorBanner";

interface UsagePriceHistoryProps {
  usage: PlanUsage;
  currencies: Currency[];
  sortedHistory: PlanPriceChange[];
  loading: boolean;
  error?: string | null;
  clearError?: () => void;
}

export function UsagePriceHistory({
  usage,
  currencies,
  sortedHistory,
  loading,
  error,
  clearError,
}: UsagePriceHistoryProps) {
  const { t } = useTranslation();
  const rows = usageMonthPriceRows(sortedHistory);

  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 2, mt: 1 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
        {t("plans.month_prices_title")}
      </Typography>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1.5 }}>
        {t("plans.usage_prices_hint")}
      </Typography>

      {error ? (
        <Box sx={{ mb: 1.5 }}>
          <ErrorBanner message={error} onDismiss={clearError} />
        </Box>
      ) : null}

      {loading ? (
        <Box sx={{ py: 1.5, display: "flex", justifyContent: "center" }}>
          <CircularProgress size={20} aria-label={t("web.loading")} />
        </Box>
      ) : rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t("plans.month_prices_history_empty")}
        </Typography>
      ) : (
        <Stack spacing={1}>
          {rows.map((row) => (
            <Box
              key={row.month}
              sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, p: 1.5 }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {billingMonthLabel(row.month, true)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {usageMonthPriceLabel(row.price, usage, currencies, t)}
              </Typography>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}
