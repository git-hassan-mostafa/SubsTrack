import { useTranslation } from "react-i18next";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ChargeStatus, Currency } from "@shared/core/types";
import { formatMoney, formatMoneyPair } from "@shared/core/utils/currency";
import { chipColors } from "@/shared/components/chipTones";
import { StatusChip } from "@/shared/components/StatusChip";
import { billStatusLook } from "./billStatusLook";

interface BillSummaryProps {
  status: ChargeStatus;
  total: number;
  collected: number;
  balance: number;
  source: Currency | null;
  display: Currency | null;
}

const HEADLINE_KEYS: Record<ChargeStatus, string> = {
  open: "web.bill.still_owed",
  partial: "web.bill.still_owed",
  settled: "web.bill.paid_in_full",
  written_off: "web.bill.written_off_amount",
  void: "web.bill.voided_amount",
};

const BAR_COLORS: Record<ChargeStatus, "error" | "warning" | "success"> = {
  open: "error",
  partial: "warning",
  settled: "success",
  written_off: "warning",
  void: "success",
};

// The ONE number that matters for this bill's state, then how much of it is paid.
export function BillSummary({ status, total, collected, balance, source, display }: BillSummaryProps) {
  const { t } = useTranslation();
  const look = billStatusLook(status);
  const colors = chipColors(look.tone);
  const closed = status === "settled" || status === "void";
  const figure = formatMoneyPair(closed ? total : balance, source, display);
  const money = (value: number) => formatMoney(value, source, source);
  const paidShare = total > 0 ? Math.min(100, (collected / total) * 100) : 0;

  return (
    <Stack spacing={1} sx={{ px: 2, py: 1.5, borderRadius: 2, bgcolor: colors.bg }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
        <Typography variant="body2" sx={{ color: colors.fg, fontWeight: 600 }}>
          {t(HEADLINE_KEYS[status])}
        </Typography>
        <StatusChip tone={look.tone} icon={look.icon} label={t(look.labelKey)} />
      </Stack>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "baseline", flexWrap: "wrap" }} useFlexGap>
        <Typography
          variant="h4"
          component="p"
          sx={{
            fontWeight: 700,
            lineHeight: 1.2,
            color: look.amountColor,
            textDecoration: look.struck ? "line-through" : "none",
          }}
        >
          {figure.primary}
        </Typography>
        {figure.approx ? (
          <Typography variant="body2" color="text.secondary">
            {figure.approx}
          </Typography>
        ) : null}
      </Stack>
      {status === "void" ? null : (
        <Stack spacing={0.5}>
          <LinearProgress
            variant="determinate"
            value={paidShare}
            color={BAR_COLORS[status]}
            aria-label={t("web.bill.paid_of", { paid: money(collected), total: money(total) })}
            sx={{
              height: 8,
              borderRadius: 4,
              bgcolor: "background.paper",
              "& .MuiLinearProgress-bar": { borderRadius: 4, transition: "none" },
            }}
          />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {t("web.bill.paid_of", { paid: money(collected), total: money(total) })}
          </Typography>
        </Stack>
      )}
      <Typography variant="body2" color="text.secondary">
        {t(look.messageKey, { amount: money(balance), paid: money(collected) })}
      </Typography>
    </Stack>
  );
}
