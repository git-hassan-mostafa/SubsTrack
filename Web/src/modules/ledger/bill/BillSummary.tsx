import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ChargeStatus } from "@shared/core/types";
import { StatusChip } from "@/shared/components/StatusChip";
import { billStatusLook } from "./billStatusLook";

interface BillSummaryProps {
  status: ChargeStatus;
  amount: string;
  approx?: string | null;
  note?: string | null;
}

// A bill's state at a glance: the figure, what is left, and one status pill.
export function BillSummary({ status, amount, approx, note }: BillSummaryProps) {
  const { t } = useTranslation();
  const look = billStatusLook(status);
  return (
    <Stack spacing={0.5} sx={{ alignItems: "center", py: 1 }}>
      <Typography
        variant="h4"
        component="p"
        sx={{ fontWeight: 700, color: look.amountColor, textDecoration: look.struck ? "line-through" : "none" }}
      >
        {amount}
      </Typography>
      {approx ? (
        <Typography variant="body2" color="text.secondary">
          {approx}
        </Typography>
      ) : null}
      {note ? <Typography variant="body2">{note}</Typography> : null}
      <StatusChip tone={look.tone} label={t(look.labelKey)} />
    </Stack>
  );
}
