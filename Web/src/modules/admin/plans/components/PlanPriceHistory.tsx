import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { Currency, Plan, PlanPriceChange } from "@shared/core/types";
import { findCurrency } from "@shared/core/utils/currency";
import { formatDate } from "@shared/core/utils/date";
import {
  planPriceSublabel,
  priceHistoryEffectiveLabel,
} from "@shared/modules/admin/plans/utils/planLabels";
import { canEditPriceStart } from "@shared/modules/customer/customer-plans/utils/priceHistory";
import { priceStartOptionsWith } from "@shared/modules/customer/customer-plans/utils/priceStartOptions";
import { ErrorBanner } from "@/shared/components/ErrorBanner";

interface PlanPriceHistoryProps {
  plan: Plan;
  currencies: Currency[];
  sortedHistory: PlanPriceChange[];
  activeChange: PlanPriceChange | null;
  loading: boolean;
  error?: string | null;
  clearError?: () => void;
  editingId: string | null;
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  submitting: boolean;
  startEdit: (change: PlanPriceChange) => void;
  cancelEdit: () => void;
  saveEdit: (changeId: string) => Promise<boolean>;
}

export function PlanPriceHistory({
  plan,
  currencies,
  sortedHistory,
  activeChange,
  loading,
  error,
  clearError,
  editingId,
  selectedMonth,
  setSelectedMonth,
  submitting,
  startEdit,
  cancelEdit,
  saveEdit,
}: PlanPriceHistoryProps) {
  const { t } = useTranslation();
  const currentActiveId = activeChange?.id ?? null;

  return (
    <Box
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2,
        p: 2,
        mt: 1,
      }}
    >
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
        {t("plans.price_history_title")}
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
      ) : sortedHistory.length === 0 ? (
        <Box
          sx={{
            p: 1.5,
            borderRadius: 1.5,
            bgcolor: "action.hover",
          }}
        >
          <Stack
            direction="row"
            sx={{ justifyContent: "space-between", alignItems: "center" }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {planPriceSublabel(
                plan,
                currencies,
                findCurrency(currencies, plan.currencyId),
                t,
              )}
            </Typography>
            <Chip
              size="small"
              label={t("plans.current_price_badge")}
              color="primary"
              variant="outlined"
              sx={{ height: 20, fontSize: "0.75rem" }}
            />
          </Stack>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mt: 0.5 }}
          >
            {t("plans.price_history_initial")} · {formatDate(plan.createdAt)}
          </Typography>
        </Box>
      ) : (
        <Stack spacing={1}>
          {sortedHistory.map((item) => {
            const isEditing = editingId === item.id;
            const isCurrent = item.id === currentActiveId;
            const options = priceStartOptionsWith(item.fromMonth);

            return (
              <Box
                key={item.id}
                sx={{
                  p: 1.5,
                  borderRadius: 1.5,
                  bgcolor: "action.hover",
                }}
              >
                <Stack
                  direction="row"
                  sx={{ justifyContent: "space-between", alignItems: "center" }}
                >
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {planPriceSublabel(
                        item,
                        currencies,
                        findCurrency(currencies, item.currencyId),
                        t,
                      )}
                    </Typography>
                    {isCurrent ? (
                      <Chip
                        size="small"
                        label={t("plans.current_price_badge")}
                        color="primary"
                        variant="outlined"
                        sx={{ height: 20, fontSize: "0.75rem" }}
                      />
                    ) : null}
                  </Stack>

                  {canEditPriceStart(item, sortedHistory) && !isEditing ? (
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => startEdit(item)}
                      sx={{ minWidth: "auto", py: 0.25, px: 1 }}
                    >
                      {t("common.edit")}
                    </Button>
                  ) : null}
                </Stack>

                {!isEditing ? (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mt: 0.5 }}
                  >
                    {priceHistoryEffectiveLabel(item, plan, t)}
                  </Typography>
                ) : (
                  <Box sx={{ mt: 1.5 }}>
                    <TextField
                      select
                      size="small"
                      label={t("plans.price_effective_from")}
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      fullWidth
                    >
                      {options.map((opt) => (
                        <MenuItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </MenuItem>
                      ))}
                    </TextField>

                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ justifyContent: "flex-end", mt: 1 }}
                    >
                      <Button
                        size="small"
                        onClick={cancelEdit}
                        disabled={submitting}
                      >
                        {t("common.cancel")}
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => saveEdit(item.id)}
                        disabled={submitting || selectedMonth === item.fromMonth}
                      >
                        {t("common.save")}
                      </Button>
                    </Stack>
                  </Box>
                )}
              </Box>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}
